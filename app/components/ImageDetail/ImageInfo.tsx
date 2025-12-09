'use client'

import { ImageData } from '../../types/image'

interface ImageInfoProps {
  image: ImageData
}

export function ImageInfo({ image }: ImageInfoProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 flex-wrap">
        {image.format && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">原始格式:</span>
            <span className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-sm">{image.format.toUpperCase()}</span>
          </div>
        )}

        {image.orientation && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">图片方向:</span>
            <span className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-sm capitalize">{image.orientation}</span>
          </div>
        )}

        {image.expiryTime && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">过期时间:</span>
            <span className="text-sm bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-sm">
              {new Date(image.expiryTime).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
} 