import type { Context } from 'hono';
import type { Env, ImageMetadata, UploadResult } from '../types';
import { StorageService } from '../services/storage';
import { MetadataService } from '../services/metadata';
import { ImageProcessor } from '../services/imageProcessor';
import { CompressionService, parseCompressionOptions } from '../services/compression';
import { successResponse, errorResponse } from '../utils/response';
import { generateImageId, parseTags, parseNumber } from '../utils/validation';

const MAX_UPLOAD_COUNT = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const formData = await c.req.formData();
    const fileEntries = formData.getAll('images[]');
    const files: File[] = [];
    for (const entry of fileEntries) {
      if (typeof entry !== 'string' && 'arrayBuffer' in entry) {
        files.push(entry as File);
      }
    }
    const tagsString = formData.get('tags') as string | null;
    const expiryMinutes = parseNumber(formData.get('expiryMinutes') as string | null, 0);

    // Parse compression options from FormData
    const compressionOptions = parseCompressionOptions(formData);

    if (!files || files.length === 0) {
      return errorResponse('No files provided');
    }

    if (files.length > MAX_UPLOAD_COUNT) {
      return errorResponse(`Maximum ${MAX_UPLOAD_COUNT} files allowed per upload`);
    }

    const tags = parseTags(tagsString);
    const storage = new StorageService(c.env.R2_BUCKET);
    const metadata = new MetadataService(c.env.DB);

    // Initialize compression service if IMAGES binding is available
    const compression = c.env.IMAGES ? new CompressionService(c.env.IMAGES) : null;

    const results: UploadResult[] = [];
    const workerUrl = new URL(c.req.url).origin;

    for (const file of files) {
      try {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          results.push({
            id: '',
            status: 'error',
            error: `File ${file.name} exceeds maximum size of 10MB`
          });
          continue;
        }

        // Read file data
        const arrayBuffer = await file.arrayBuffer();

        // Get image info
        const imageInfo = await ImageProcessor.getImageInfo(arrayBuffer);

        if (!ImageProcessor.isSupportedFormat(imageInfo.format)) {
          results.push({
            id: '',
            status: 'error',
            error: `Unsupported format: ${imageInfo.format}`
          });
          continue;
        }

        // Generate unique ID and paths
        const id = generateImageId();
        const paths = StorageService.generatePaths(id, imageInfo.orientation, imageInfo.format);

        // Upload original file
        const contentType = ImageProcessor.getContentType(imageInfo.format);
        await storage.upload(paths.original, arrayBuffer, contentType);

        // For non-GIF images, compress and store WebP/AVIF versions
        const isGif = imageInfo.format === 'gif';
        let webpSize = 0;
        let avifSize = 0;

        if (!isGif) {
          if (compression) {
            // Use Cloudflare Images for real compression
            try {
              const compressionResult = await compression.compress(
                arrayBuffer,
                imageInfo.format,
                compressionOptions
              );

              // Upload compressed WebP
              if (compressionResult.webp) {
                await storage.upload(paths.webp, compressionResult.webp.data, 'image/webp');
                webpSize = compressionResult.webp.size;
              } else {
                // Fallback: store original
                await storage.upload(paths.webp, arrayBuffer, contentType);
                webpSize = file.size;
              }

              // Upload compressed AVIF
              if (compressionResult.avif) {
                await storage.upload(paths.avif, compressionResult.avif.data, 'image/avif');
                avifSize = compressionResult.avif.size;
              } else {
                // Fallback: store original
                await storage.upload(paths.avif, arrayBuffer, contentType);
                avifSize = file.size;
              }
            } catch (compressionError) {
              console.error('Compression failed, falling back to original:', compressionError);
              // Fallback: store original for both formats
              await storage.upload(paths.webp, arrayBuffer, contentType);
              await storage.upload(paths.avif, arrayBuffer, contentType);
              webpSize = file.size;
              avifSize = file.size;
            }
          } else {
            // No compression service available, store original
            await storage.upload(paths.webp, arrayBuffer, contentType);
            await storage.upload(paths.avif, arrayBuffer, contentType);
            webpSize = file.size;
            avifSize = file.size;
          }
        }

        // Calculate expiry time
        let expiryTime: string | undefined;
        if (expiryMinutes > 0) {
          const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
          expiryTime = expiry.toISOString();
        }

        // Create metadata
        const imageMetadata: ImageMetadata = {
          id,
          originalName: file.name,
          uploadTime: new Date().toISOString(),
          expiryTime,
          orientation: imageInfo.orientation,
          tags,
          format: imageInfo.format,
          width: imageInfo.width,
          height: imageInfo.height,
          paths,
          sizes: {
            original: file.size,
            webp: webpSize,
            avif: avifSize
          }
        };

        // Save metadata
        await metadata.saveImage(imageMetadata);

        // Build URLs
        const baseUrl = `${workerUrl}/r2`;
        results.push({
          id,
          status: 'success',
          urls: {
            original: `${baseUrl}/${paths.original}`,
            webp: isGif ? '' : `${baseUrl}/${paths.webp}`,
            avif: isGif ? '' : `${baseUrl}/${paths.avif}`
          },
          orientation: imageInfo.orientation,
          tags,
          sizes: imageMetadata.sizes,
          expiryTime,
          format: imageInfo.format
        });

      } catch (err) {
        console.error('Upload error for file:', file.name, err);
        results.push({
          id: '',
          status: 'error',
          error: `Failed to upload ${file.name}`
        });
      }
    }

    return successResponse({ results });

  } catch (err) {
    console.error('Upload handler error:', err);
    return errorResponse('Upload failed');
  }
}
