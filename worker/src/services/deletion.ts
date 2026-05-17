import type { Env } from '../types';
import type { ImagePaths } from '../types/queue';
import { MetadataService, type ImageDeletionTarget } from './metadata';
import { StorageService } from './storage';

const DELETE_QUEUE_CHUNK_SIZE = 50;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toDeletionTarget(id: string, paths: ImagePaths): ImageDeletionTarget {
  return { id, paths };
}

export async function processImageDeletionTargets(
  env: Env,
  targets: ImageDeletionTarget[]
): Promise<void> {
  if (targets.length === 0) return;

  const metadata = new MetadataService(env.DB);
  const storage = new StorageService(env.R2_BUCKET);
  const ids = targets.map((target) => target.id);

  try {
    await storage.deleteImageFilesBatch(targets.map((target) => target.paths));
    await metadata.completeDeletionJobsForImages(ids);
  } catch (err) {
    await metadata.recordDeletionJobFailureForImages(ids, errorMessage(err));
    throw err;
  }
}

export async function dispatchImageDeletions(
  env: Env,
  targets: ImageDeletionTarget[],
  label = 'image'
): Promise<void> {
  if (targets.length === 0) return;

  if (env.USE_QUEUE === 'true' && env.DELETE_QUEUE) {
    try {
      if (targets.length === 1) {
        const [target] = targets;
        await env.DELETE_QUEUE.send({
          type: 'delete_image',
          imageId: target.id,
          paths: target.paths,
        });
      } else {
        for (let i = 0; i < targets.length; i += DELETE_QUEUE_CHUNK_SIZE) {
          await env.DELETE_QUEUE.send({
            type: 'delete_tag_images',
            tagName: label,
            imagePaths: targets.slice(i, i + DELETE_QUEUE_CHUNK_SIZE),
          });
        }
      }
      return;
    } catch (err) {
      console.error('Queue deletion dispatch failed; falling back to direct R2 deletion:', err);
    }
  }

  await processImageDeletionTargets(env, targets);
}

export async function processPendingDeletionJobs(env: Env, limit = 100): Promise<number> {
  const metadata = new MetadataService(env.DB);
  const jobs = await metadata.getPendingDeletionJobs(limit);
  await processImageDeletionTargets(env, jobs);
  return jobs.length;
}
