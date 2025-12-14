// Image Compression Service using Cloudflare Images binding
import type {
  ImagesBinding,
  CompressionOptions,
  CompressedImage,
  CompressionResult,
} from '../types';
import { ImageProcessor } from './imageProcessor';

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  quality: 90,
  maxWidth: 3840,
  maxHeight: 3840,
  preserveAnimation: true,
  generateWebp: true,
  generateAvif: true,
};

export class CompressionService {
  private images: ImagesBinding;

  constructor(images: ImagesBinding) {
    this.images = images;
  }

  /**
   * Compress image to WebP and AVIF formats
   */
  async compress(
    data: ArrayBuffer,
    format: string,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Check for animated GIF
    const isAnimated = format === 'gif' && this.isAnimatedGif(data);

    // Skip compression for animated GIFs if preserveAnimation is true
    if (isAnimated && opts.preserveAnimation) {
      return { original: data, isAnimated: true };
    }

    const result: CompressionResult = { original: data, isAnimated: false };

    // Get original dimensions
    const { width, height } = await ImageProcessor.getImageDimensions(data);

    // Calculate target dimensions
    const targetDims = this.calculateDimensions(
      width,
      height,
      opts.maxWidth,
      opts.maxHeight
    );

    // AVIF dimensions (with 1600px max while preserving aspect ratio)
    const avifDims = this.calculateDimensions(
      width,
      height,
      Math.min(opts.maxWidth, 1600),
      Math.min(opts.maxHeight, 1600)
    );

    // Compress to WebP and AVIF in parallel (optionally)
    const [webpResult, avifResult] = await Promise.all([
      opts.generateWebp
        ? this.compressToFormat(data, 'webp', opts.quality, targetDims)
          .catch((e) => {
            console.error('WebP compression failed:', e);
            return null;
          })
        : Promise.resolve(null),
      opts.generateAvif
        ? this.compressToFormat(data, 'avif', opts.quality, avifDims)
          .catch((e) => {
            console.error('AVIF compression failed:', e);
            return null;
          })
        : Promise.resolve(null),
    ]);

    if (webpResult) result.webp = webpResult;
    if (avifResult) result.avif = avifResult;

    return result;
  }

  /**
   * Compress image to specific format
   */
  private async compressToFormat(
    data: ArrayBuffer,
    format: 'webp' | 'avif',
    quality: number,
    dimensions: { width: number; height: number }
  ): Promise<CompressedImage> {
    const transformer = this.images.input(data);

    const output = await transformer
      .transform({
        width: dimensions.width,
        height: dimensions.height,
        fit: 'scale-down',
      })
      .output({
        format,
        quality,
      });

    const response = output.response();
    const compressedData = await response.arrayBuffer();

    return {
      data: compressedData,
      contentType: output.contentType(),
      size: compressedData.byteLength,
    };
  }

  /**
   * Calculate target dimensions while maintaining aspect ratio
   */
  private calculateDimensions(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    if (width <= maxWidth && height <= maxHeight) {
      return { width, height };
    }

    const scale = Math.min(maxWidth / width, maxHeight / height);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }

  /**
   * Detect if GIF is animated (has multiple frames)
   */
  private isAnimatedGif(data: ArrayBuffer): boolean {
    const bytes = new Uint8Array(data);
    let frameCount = 0;

    // Look for multiple Graphic Control Extensions (0x21 0xF9) or Image Descriptors (0x2C)
    for (let i = 0; i < bytes.length - 1; i++) {
      // Graphic Control Extension
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9) {
        frameCount++;
        if (frameCount > 1) return true;
      }
      // Image Descriptor
      if (bytes[i] === 0x2C) {
        frameCount++;
        if (frameCount > 1) return true;
      }
    }

    return false;
  }
}

/**
 * Parse compression options from FormData
 */
export function parseCompressionOptions(formData: FormData): CompressionOptions {
  const parseNumber = (value: string | null, defaultValue: number): number => {
    if (!value) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  };

  return {
    quality: parseNumber(formData.get('quality') as string | null, DEFAULT_OPTIONS.quality),
    maxWidth: parseNumber(formData.get('maxWidth') as string | null, DEFAULT_OPTIONS.maxWidth),
    maxHeight: parseNumber(formData.get('maxHeight') as string | null, DEFAULT_OPTIONS.maxHeight),
    preserveAnimation: formData.get('preserveAnimation') !== 'false',
    generateWebp: formData.get('generateWebp') === null
      ? DEFAULT_OPTIONS.generateWebp
      : formData.get('generateWebp') !== 'false',
    generateAvif: formData.get('generateAvif') === null
      ? DEFAULT_OPTIONS.generateAvif
      : formData.get('generateAvif') !== 'false',
  };
}
