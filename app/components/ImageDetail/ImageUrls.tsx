'use client'

import { useState, type JSX } from 'react';
import { CheckIcon, CopyIcon, ImageIcon, FileIcon, Link1Icon, EyeOpenIcon } from '../ui/icons'
import { ImageData, CopyStatus } from '../../types/image'
import { getFullUrl } from '../../utils/baseUrl'
import { copyToClipboard } from '../../utils/clipboard'

interface ImageUrlsProps {
  image: ImageData
}

interface UrlItemProps {
  title: string
  url: string
  icon: JSX.Element
  iconColor: string
  copyType: string
  copyStatus: CopyStatus | null
  onCopy: (text: string, type: string) => void
}

function UrlItem({ title, url, icon, iconColor, copyType, copyStatus, onCopy }: UrlItemProps) {
  const [showFullUrl, setShowFullUrl] = useState(false);
  const isLongUrl = url.length > 60;
  const displayUrl = showFullUrl || !isLongUrl ? url : `${url.substring(0, 45)}...${url.substring(url.length - 15)}`;

  return (
    <div className="space-y-2">
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <div className={`${iconColor} p-1.5 rounded-md bg-gray-100 dark:bg-gray-800`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
      </div>
      
      {/* URL显示和操作 */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        {/* URL显示区域 */}
        <div className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 break-all leading-relaxed">
          {displayUrl}
        </div>
        
        {/* 操作按钮区域 */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-750">
          <div className="flex items-center gap-2">
            {isLongUrl && (
              <button
                onClick={() => setShowFullUrl(!showFullUrl)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                <EyeOpenIcon className="h-3 w-3" />
                {showFullUrl ? '收起' : '展开'}
              </button>
            )}
          </div>
          
          <button
            onClick={() => onCopy(url, copyType)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-sm transition-colors"
            title="复制链接"
          >
            {copyStatus && copyStatus.type === copyType ? (
              <>
                <CheckIcon className="h-3 w-3 text-green-500" />
                <span className="text-green-500">已复制</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3 w-3" />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ImageUrls({ image }: ImageUrlsProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null)

  const handleCopy = (text: string, type: string) => {
    copyToClipboard(text)
      .then(success => {
        if (success) {
          setCopyStatus({ type })
          setTimeout(() => {
            setCopyStatus(null)
          }, 2000)
        } else {
          console.error("复制失败")
        }
      })
      .catch(err => {
        console.error("复制失败:", err)
      })
  }

  const originalUrl = getFullUrl(image.urls?.original || '')
  const webpUrl = getFullUrl(image.urls?.webp || '')
  const avifUrl = getFullUrl(image.urls?.avif || '')

  return (
    <div className="space-y-4">
      <UrlItem
        title="原始图片"
        url={originalUrl}
        icon={<ImageIcon className="h-4 w-4" />}
        iconColor="text-blue-500"
        copyType="original"
        copyStatus={copyStatus}
        onCopy={handleCopy}
      />

      {webpUrl && (
        <UrlItem
          title="WebP 格式"
          url={webpUrl}
          icon={<FileIcon className="h-4 w-4" />}
          iconColor="text-purple-500"
          copyType="webp"
          copyStatus={copyStatus}
          onCopy={handleCopy}
        />
      )}

      {avifUrl && (
        <UrlItem
          title="AVIF 格式"
          url={avifUrl}
          icon={<FileIcon className="h-4 w-4" />}
          iconColor="text-green-500"
          copyType="avif"
          copyStatus={copyStatus}
          onCopy={handleCopy}
        />
      )}

      <UrlItem
        title="Markdown 格式"
        url={`![${image.originalName || ''}](${webpUrl || originalUrl})`}
        icon={<Link1Icon className="h-4 w-4" />}
        iconColor="text-amber-500"
        copyType="markdown"
        copyStatus={copyStatus}
        onCopy={handleCopy}
      />
    </div>
  )
} 