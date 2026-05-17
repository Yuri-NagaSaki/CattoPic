// Queue Consumer Handler - 处理异步 R2 文件删除
import type { Env } from '../types';
import type { QueueMessage } from '../types/queue';
import { processImageDeletionTargets, toDeletionTarget } from '../services/deletion';

export async function handleQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      switch (message.body.type) {
        case 'delete_image':
          console.log(`Deleting R2 files for image: ${message.body.imageId}`);
          await processImageDeletionTargets(env, [
            toDeletionTarget(message.body.imageId, message.body.paths),
          ]);
          break;

        case 'delete_tag_images':
          console.log(`Deleting R2 files for tag: ${message.body.tagName}, ${message.body.imagePaths.length} images`);
          await processImageDeletionTargets(
            env,
            message.body.imagePaths.map((img) => toDeletionTarget(img.id, img.paths))
          );
          break;
      }
      message.ack();
    } catch (error) {
      console.error('Queue message failed:', error);
      message.retry();
    }
  }
}
