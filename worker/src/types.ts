// Cloudflare Images binding types
export interface ImagesBinding {
  input(source: ReadableStream | ArrayBuffer | Blob): ImageTransformer;
}

export interface ImageTransformer {
  transform(options: ImageTransformOptions): ImageTransformer;
  output(options: ImageOutputOptions): Promise<ImageOutputResult>;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  gravity?: 'auto' | 'left' | 'right' | 'top' | 'bottom' | 'center';
  quality?: number;
  rotate?: 0 | 90 | 180 | 270;
}

export interface ImageOutputOptions {
  format:
    | 'webp'
    | 'avif'
    | 'jpeg'
    | 'png'
    | 'image/webp'
    | 'image/avif'
    | 'image/jpeg'
    | 'image/png';
  quality?: number;
}

export interface ImageOutputResult {
  image(): ReadableStream;
  response(): Response;
  contentType(): string;
}

// Compression options
export interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  preserveAnimation?: boolean;
  generateWebp?: boolean;
  generateAvif?: boolean;
}

export interface CompressedImage {
  data: ArrayBuffer;
  contentType: string;
  size: number;
}

export interface CompressionResult {
  original: ArrayBuffer;
  webp?: CompressedImage;
  avif?: CompressedImage;
  isAnimated: boolean;
}

// Import Queue message types
import type { QueueMessage } from './types/queue';

// Cloudflare Worker bindings
export interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  CACHE_KV: KVNamespace;
  ENVIRONMENT: string;
  R2_PUBLIC_URL: string;
  IMAGES?: ImagesBinding;
  DELETE_QUEUE?: Queue<QueueMessage>;
  USE_QUEUE?: string;
}

// D1 row type for images table
export interface ImageRow {
  id: string;
  original_name: string;
  upload_time: string;
  expiry_time: string | null;
  orientation: string;
  format: string;
  width: number;
  height: number;
  path_original: string;
  path_webp: string | null;
  path_avif: string | null;
  size_original: number;
  size_webp: number;
  size_avif: number;
}

// Image metadata
export interface ImageMetadata {
  id: string;
  originalName: string;
  uploadTime: string;
  expiryTime?: string;
  orientation: 'landscape' | 'portrait';
  tags: string[];
  format: string;
  width: number;
  height: number;
  paths: {
    original: string;
    webp: string;
    avif: string;
  };
  sizes: {
    original: number;
    webp: number;
    avif: number;
  };
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Upload types
export interface UploadResult {
  id: string;
  status: 'success' | 'error';
  urls?: {
    original: string;
    webp: string;
    avif: string;
  };
  orientation?: 'landscape' | 'portrait';
  tags?: string[];
  sizes?: {
    original: number;
    webp: number;
    avif: number;
  };
  expiryTime?: string;
  format?: string;
  error?: string;
}

// Tag types
export interface Tag {
  name: string;
  count: number;
}

// Config types
export interface Config {
  maxUploadCount: number;
  maxFileSize: number;
  supportedFormats: string[];
  imageQuality: number;
}

// Filter types
export interface ImageFilters {
  page?: number;
  limit?: number;
  tag?: string;
  orientation?: 'landscape' | 'portrait';
  format?: 'all' | 'gif' | 'webp' | 'avif' | 'original';
}

export interface RandomFilters {
  tags?: string[];
  exclude?: string[];
  orientation?: 'landscape' | 'portrait' | 'auto';
  format?: 'original' | 'webp' | 'avif';
}
