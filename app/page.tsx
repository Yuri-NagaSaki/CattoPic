'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiKey, validateApiKey, setApiKey } from './utils/auth'
import { api } from './utils/request'
import { concurrentUpload } from './utils/concurrentUpload'
import ApiKeyModal from './components/ApiKeyModal'
import { UploadResponse, StatusMessage as StatusMessageType, ConfigSettings, ImageFile, UploadResult, ImageListResponse } from './types'
import Header from './components/Header'
import UploadSection from './components/UploadSection'
import ImageSidebar from './components/ImageSidebar'
import PreviewSidebar from './components/upload/PreviewSidebar'
import CompressionSettings from './components/upload/CompressionSettings'
import { motion } from 'motion/react'
import { ImageIcon, PlusCircledIcon } from './components/ui/icons'
import { useInvalidateImages } from './hooks/useImages'
import { useUploadState } from './hooks/useUploadState'
import { UploadFileItem } from './types/upload'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { queryKeys } from './lib/queryKeys'

const DEFAULT_MAX_UPLOAD_COUNT = 50;

export default function Home() {
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [status, setStatus] = useState<StatusMessageType | null>(null)
  const [uploadResults, setUploadResults] = useState<UploadResponse['results']>([])
  const [showResultSidebar, setShowResultSidebar] = useState(false)
  const [showPreviewSidebar, setShowPreviewSidebar] = useState(false)
  const [isKeyVerified, setIsKeyVerified] = useState(false)
  const [maxUploadCount, setMaxUploadCount] = useState(DEFAULT_MAX_UPLOAD_COUNT)
  const [fileDetails, setFileDetails] = useState<{ id: string, file: File }[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [expiryMinutes, setExpiryMinutes] = useState<number>(0)

  // TanStack Query cache invalidation hook
  const invalidateImages = useInvalidateImages()
  const queryClient = useQueryClient()

  // 上传状态管理
  const uploadState = useUploadState()
  const { phase, files: uploadFiles, completedCount, errorCount, initializeUpload, updateFileStatus, cancelUpload, reset: resetUploadState } = uploadState

  // 判断是否正在上传
  const isUploading = phase === 'uploading' || phase === 'processing'

  // 压缩设置状态
  const [compressionQuality, setCompressionQuality] = useState(90)
  const [compressionMaxWidth, setCompressionMaxWidth] = useState(3840)
  const [preserveAnimation, setPreserveAnimation] = useState(true)
  const [outputFormat, setOutputFormat] = useState<'webp' | 'avif' | 'both'>('both')

  const primeImagesListCache = useCallback((results: UploadResult[]) => {
    const uploadedImages: ImageFile[] = results
      .filter((r) => r.status === 'success' && !!r.urls?.original && !!r.orientation && !!r.format)
      .map((r) => ({
        id: r.id,
        originalName: r.originalName || '',
        uploadTime: new Date().toISOString(),
        expiryTime: r.expiryTime,
        orientation: r.orientation!,
        tags: r.tags || [],
        format: r.format || '',
        width: 0,
        height: 0,
        paths: { original: '', webp: '', avif: '' },
        sizes: {
          original: r.sizes?.original || 0,
          webp: r.sizes?.webp || 0,
          avif: r.sizes?.avif || 0,
        },
        urls: {
          original: r.urls!.original,
          webp: r.urls!.webp,
          avif: r.urls!.avif,
        },
      }))

    if (uploadedImages.length === 0) return

    // Store a small in-memory "recent uploads" list so newly created filter queries can render instantly.
    queryClient.setQueryData<ImageFile[]>(queryKeys.images.recentUploads(), (old) => {
      const existing = Array.isArray(old) ? old : []
      const merged = [...uploadedImages, ...existing]
      const seen = new Set<string>()
      const unique: ImageFile[] = []
      for (const img of merged) {
        if (!img.id || seen.has(img.id)) continue
        seen.add(img.id)
        unique.push(img)
      }
      return unique.slice(0, 200)
    })

    const isInfiniteData = (value: unknown): value is InfiniteData<ImageListResponse> => {
      return !!value
        && typeof value === 'object'
        && 'pages' in value
        && Array.isArray((value as { pages: unknown }).pages)
        && 'pageParams' in value
        && Array.isArray((value as { pageParams: unknown }).pageParams)
    }

    const isImageListResponse = (value: unknown): value is ImageListResponse => {
      return !!value
        && typeof value === 'object'
        && 'images' in value
        && Array.isArray((value as { images: unknown }).images)
        && 'page' in value
    }

    const uniqueById = (items: ImageFile[]) => {
      const seen = new Set<string>()
      const out: ImageFile[] = []
      for (const item of items) {
        if (!item.id || seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
      }
      return out
    }

    const mergeFirstPage = (existing: ImageFile[], additions: ImageFile[], limit: number) => {
      return uniqueById([...additions, ...existing]).slice(0, limit)
    }

    const cachedLists = queryClient.getQueriesData({
      queryKey: queryKeys.images.lists(),
    })

    for (const [queryKey, data] of cachedLists) {
      if (!Array.isArray(queryKey) || queryKey.length < 3) continue

      const filters = queryKey[2] as { page?: number; tag?: string; orientation?: string; limit?: number } | undefined
      const tag = typeof filters?.tag === 'string' ? filters.tag : ''
      const orientation = typeof filters?.orientation === 'string' ? filters.orientation : ''
      const limit = typeof filters?.limit === 'number' ? filters.limit : 24
      const page = typeof filters?.page === 'number' ? filters.page : undefined

      const candidates = uploadedImages.filter((img) => {
        const tagOk = !tag || img.tags.includes(tag)
        const orientationOk = !orientation || img.orientation === orientation
        return tagOk && orientationOk
      })
      if (candidates.length === 0) continue

      if (isInfiniteData(data)) {
        queryClient.setQueryData<InfiniteData<ImageListResponse>>(queryKey, (old) => {
          if (!old || old.pages.length === 0) return old

          const allIds = new Set<string>()
          for (const p of old.pages) {
            for (const img of p.images) allIds.add(img.id)
          }

          const missingCount = candidates.filter((img) => img.id && !allIds.has(img.id)).length
          const firstPage = old.pages[0]
          const total = Math.max(firstPage.total || 0, (firstPage.total || 0) + missingCount)
          const totalPages = Math.max(1, Math.ceil(total / limit))

          return {
            ...old,
            pages: old.pages.map((p, idx) => idx === 0
              ? { ...p, images: mergeFirstPage(p.images, candidates, limit), total, totalPages }
              : { ...p, total, totalPages }
            ),
          }
        })
        continue
      }

      if (isImageListResponse(data)) {
        queryClient.setQueryData<ImageListResponse>(queryKey, (old) => {
          if (!old) return old

          const existingIds = new Set(old.images.map((i) => i.id))
          const missingCount = candidates.filter((img) => img.id && !existingIds.has(img.id)).length
          const total = Math.max(old.total || 0, (old.total || 0) + missingCount)
          const totalPages = Math.max(1, Math.ceil(total / limit))

          // Only page 1 can be safely prepended without shifting other pages.
          if ((page ?? 1) !== 1) {
            return { ...old, total, totalPages }
          }

          return { ...old, images: mergeFirstPage(old.images, candidates, limit), total, totalPages }
        })
      }
    }
  }, [queryClient])

  useEffect(() => {
    if (uploadResults.length > 0 && !showResultSidebar) {
      setShowResultSidebar(true)
      // 上传完成后关闭预览侧边栏
      setShowPreviewSidebar(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadResults.length])

  // 监听文件选择，当有文件选择时，打开预览侧边栏
  useEffect(() => {
    if (fileDetails.length > 0 && !showPreviewSidebar) {
      setShowPreviewSidebar(true)
    } else if (fileDetails.length === 0) {
      setShowPreviewSidebar(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileDetails.length])

  useEffect(() => {
    const checkApiKey = async () => {
      const apiKey = getApiKey()
      if (!apiKey) {
        setShowApiKeyModal(true)
        setIsKeyVerified(false)
        return
      }

      const isValid = await validateApiKey(apiKey)
      if (!isValid) {
        setShowApiKeyModal(true)
        setIsKeyVerified(false)
        setStatus({
          type: 'error',
          message: 'API Key无效,请重新验证'
        })
      } else {
        setIsKeyVerified(true)
      }
    }

    checkApiKey()
     
  }, [])

  useEffect(() => {
    // 获取配置
    const fetchConfig = async () => {
      try {
        const response = await api.request<{ success: boolean; config: ConfigSettings }>('/api/config')
        if (response.success && response.config) {
          setMaxUploadCount(response.config.maxUploadCount)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
        // 如果获取失败，使用默认值
        setMaxUploadCount(DEFAULT_MAX_UPLOAD_COUNT)
      }
    }

    fetchConfig()
     
  }, [])

  const handleUpload = async () => {
    if (fileDetails.length === 0) return

    const apiKey = getApiKey()
    if (!apiKey) {
      setShowApiKeyModal(true)
      return
    }

    setStatus(null)

    // 初始化上传状态，获取 AbortController
    const controller = initializeUpload(fileDetails)

    try {
      // 使用并发上传（5个同时）
      const results = await concurrentUpload({
        files: fileDetails,
        concurrency: 5,
        tags: selectedTags,
        expiryMinutes,
        quality: compressionQuality,
        maxWidth: compressionMaxWidth,
        preserveAnimation,
        outputFormat,
        onFileStatusChange: updateFileStatus,
        signal: controller.signal,
      })

      // 处理结果
      const resultsWithIds = results.map(item => {
        let imageId = item.id || Math.random().toString(36).substring(2)
        const path = item.urls?.original || ''

        if (item.urls?.original && !item.id) {
          const urlParts = item.urls.original.split('/')
          const filename = urlParts[urlParts.length - 1]
          if (filename.includes('.')) {
            imageId = filename.split('.')[0]
          }
        }

        return {
          ...item,
          id: imageId,
          path
        }
      })

      setUploadResults(resultsWithIds)
      const successCount = resultsWithIds.filter(r => r.status === 'success').length
      const failedCount = resultsWithIds.filter(r => r.status === 'error').length
      const totalCount = resultsWithIds.length

      setStatus({
        type: failedCount === 0 ? 'success' : 'warning',
        message: `上传完成：共${totalCount}张，${successCount}张成功，${failedCount}张失败`
      })

      // Invalidate image list cache
      primeImagesListCache(resultsWithIds)
      invalidateImages()

      // 重置文件详情
      setFileDetails([])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStatus({
          type: 'warning',
          message: '上传已取消'
        })
        return
      }

      let errorMessage = '上传失败，请重试'
      if (error instanceof Error) {
        errorMessage = `上传失败：${error.message}`
      }

      setStatus({
        type: 'error',
        message: errorMessage
      })

      resetUploadState()
    }
  }

  // 取消上传处理
  const handleCancelUpload = useCallback(() => {
    cancelUpload()
    setStatus({
      type: 'warning',
      message: '上传已取消'
    })
  }, [cancelUpload])

  const handleDeleteImage = async (id: string) => {
    try {
      const image = uploadResults.find((img) => img.id === id);
      if (!image) return;

      // 使用图片的 ID 直接删除
      const imageId = image.id;

      const response = await api.delete<{ success: boolean; message: string }>(
        `/api/images/${imageId}`
      );

      if (response.success) {
        // From current list remove the deleted image
        setUploadResults(prev => prev.filter(item => item.id !== id));

        // If after deletion no images are left, close the sidebar
        if (uploadResults.length <= 1) {
          setShowResultSidebar(false);
        }

        setStatus({
          type: 'success',
          message: response.message || '删除成功'
        });
      } else {
        setStatus({
          type: 'error',
          message: '删除失败'
        });
      }
    } catch (error) {
      console.error('删除失败:', error);
      setStatus({
        type: 'error',
        message: '删除失败，请重试'
      });
    }
  }

  // 文件选择、删除和清空处理函数
  const handleFilesSelected = (files: { id: string, file: File }[]) => {
    // 选择新文件时，重置上传状态为 idle
    if (phase !== 'idle') {
      resetUploadState();
    }
    // 清空之前的上传结果，避免 ImageSidebar 意外打开
    if (uploadResults.length > 0) {
      setUploadResults([]);
      setShowResultSidebar(false);
    }
    setFileDetails(files);
  }

  const handleRemoveFile = (id: string) => {
    const updatedFiles = fileDetails.filter(item => item.id !== id);
    setFileDetails(updatedFiles);
    
    // 如果没有文件了，可以选择关闭侧边栏
    if (updatedFiles.length === 0) {
      setShowPreviewSidebar(false);
    }
  }

  const handleRemoveAllFiles = () => {
    setFileDetails([]);
    setShowPreviewSidebar(false);
  }

  // 更新标签
  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
  }

  // 切换侧边栏状态
  const togglePreviewSidebar = () => {
    setShowPreviewSidebar(!showPreviewSidebar);
  }

  // 计算主内容的样式，根据侧边栏是否打开调整内容区域
  const mainContentStyle = { margin: '0 auto' };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8" style={mainContentStyle}>
      <Header onApiKeyClick={() => setShowApiKeyModal(true)} isKeyVerified={isKeyVerified} />

      {status && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`mb-6 p-4 rounded-xl ${
            status.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : status.type === "warning"
              ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
          }`}
        >
          {status.message}
        </motion.div>
      )}

      <UploadSection
        onUpload={handleUpload}
        isUploading={isUploading}
        maxUploadCount={maxUploadCount}
        onFilesSelected={handleFilesSelected}
        onTogglePreview={togglePreviewSidebar}
        isPreviewOpen={showPreviewSidebar}
        fileCount={fileDetails.length}
        existingFiles={fileDetails}
        expiryMinutes={expiryMinutes}
        setExpiryMinutes={setExpiryMinutes}
        onTagsChange={handleTagsChange}
        compressionQuality={compressionQuality}
        compressionMaxWidth={compressionMaxWidth}
        preserveAnimation={preserveAnimation}
        outputFormat={outputFormat}
        onZipUploadComplete={(results) => {
          // ZIP上传完成后刷新图片缓存
          primeImagesListCache(results)
          invalidateImages()
          setStatus({
            type: 'success',
            message: 'ZIP批量上传完成'
          })
        }}
      />

      {/* 压缩设置 */}
      <div className="mt-6">
        <CompressionSettings
          quality={compressionQuality}
          maxWidth={compressionMaxWidth}
          preserveAnimation={preserveAnimation}
          outputFormat={outputFormat}
          onQualityChange={setCompressionQuality}
          onMaxWidthChange={setCompressionMaxWidth}
          onPreserveAnimationChange={setPreserveAnimation}
          onOutputFormatChange={setOutputFormat}
        />
      </div>

      {/* 只有在有上传结果且结果侧边栏关闭时显示 */}
      {uploadResults.length > 0 && !showResultSidebar && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => setShowResultSidebar(true)}
          className="fixed bottom-6 right-6 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full p-3 shadow-lg hover:shadow-xl transition-all z-20 flex items-center justify-center"
          title="查看已上传图片"
        >
          <div className="relative">
            <ImageIcon className="h-6 w-6" />
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{uploadResults.length}</span>
          </div>
        </motion.button>
      )}

      {/* 只有在有待上传图片且预览侧边栏关闭时显示 */}
      {fileDetails.length > 0 && !showPreviewSidebar && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => setShowPreviewSidebar(true)}
          className="fixed bottom-20 right-6 bg-indigo-500 dark:bg-indigo-400 text-white rounded-full p-3 shadow-lg hover:shadow-xl transition-all z-20 flex items-center justify-center"
          title="查看待上传图片"
        >
          <div className="relative">
            <PlusCircledIcon className="h-6 w-6" />
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{fileDetails.length}</span>
          </div>
        </motion.button>
      )}

      {/* 上传结果侧边栏 */}
      <ImageSidebar
        isOpen={showResultSidebar}
        results={uploadResults}
        onClose={() => setShowResultSidebar(false)}
        onDelete={handleDeleteImage}
      />

      {/* 待上传图片预览侧边栏 */}
      <PreviewSidebar
        files={phase === 'idle' ? fileDetails.map(f => ({ ...f, status: 'pending' as const })) : uploadFiles}
        phase={phase}
        completedCount={completedCount}
        errorCount={errorCount}
        onRemoveFile={handleRemoveFile}
        onRemoveAll={handleRemoveAllFiles}
        isOpen={showPreviewSidebar}
        onClose={() => setShowPreviewSidebar(false)}
        onUpload={handleUpload}
        onCancelUpload={handleCancelUpload}
      />

      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSuccess={(apiKey) => {
          setApiKey(apiKey)
          setShowApiKeyModal(false)
          setIsKeyVerified(true)
          setStatus({
            type: 'success',
            message: 'API Key验证成功！'
          })
        }}
      />
    </div>
  )
}
