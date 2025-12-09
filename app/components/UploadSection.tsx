'use client'

import React, { useState, useEffect } from 'react'
import UploadDropzone from './upload/UploadDropzone'
import ExpirySelector from './ExpirySelector'
import TagSelector from './upload/TagSelector'
import { api } from '../utils/request'
import { UploadIcon, ExclamationTriangleIcon, ImageIcon } from '../components/ui/icons'

interface UploadSectionProps {
  onUpload: (files: File[], expiryMinutes: number, tags: string[]) => Promise<void>
  isUploading: boolean
  maxUploadCount?: number
  onFilesSelected?: (files: { id: string, file: File }[]) => void
  onTogglePreview?: () => void
  isPreviewOpen?: boolean
  fileCount?: number
  existingFiles?: { id: string, file: File }[]
  expiryMinutes: number
  setExpiryMinutes: React.Dispatch<React.SetStateAction<number>>
  onTagsChange?: (tags: string[]) => void
}

export default function UploadSection({ 
  onUpload, 
  isUploading, 
  maxUploadCount = 10, 
  onFilesSelected,
  onTogglePreview,
  isPreviewOpen,
  fileCount = 0,
  existingFiles = [],
  expiryMinutes,
  setExpiryMinutes,
  onTagsChange
}: UploadSectionProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileDetails, setFileDetails] = useState<{ id: string, file: File }[]>([])
  const [wasUploading, setWasUploading] = useState(false)
  const [exceedsLimit, setExceedsLimit] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])

  // 获取可用标签列表
  const fetchTags = async () => {
    try {
      const response = await api.get<{ success: boolean; tags: { name: string; count: number }[] }>('/api/tags')
      if (response.success && response.tags && response.tags.length > 0) {
        setAvailableTags(response.tags.map(t => t.name))
      }
    } catch (error) {
      console.error('获取标签失败:', error)
    }
  }

  // 首次加载时获取标签
  useEffect(() => {
    fetchTags()
  }, [])

  // 监听上传状态变化，当上传完成时清空选择的文件
  useEffect(() => {
    if (wasUploading && !isUploading) {
      setSelectedFiles([])
      setFileDetails([])
      setExceedsLimit(false)
    }
    setWasUploading(isUploading)
  }, [isUploading, wasUploading])

  // 如果fileCount从外部变为0，清空本地状态
  useEffect(() => {
    if (fileCount === 0 && selectedFiles.length > 0) {
      setSelectedFiles([])
      setFileDetails([])
      setExceedsLimit(false)
    }
  }, [fileCount])

  // 同步现有文件列表
  useEffect(() => {
    if (existingFiles.length > 0) {
      // 更新本地状态以反映外部文件列表
      const filesArray = existingFiles.map(item => item.file);
      setSelectedFiles(filesArray);
      setFileDetails(existingFiles);
    }
  }, [existingFiles]);

  // 处理标签变化
  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
    
    // 通知父组件
    if (onTagsChange) {
      onTagsChange(tags);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    // 获取当前的文件列表
    const currentFiles = [...selectedFiles];
    const currentDetails = [...fileDetails];
    
    // 创建新的文件列表
    const newFiles = [...currentFiles];
    const newDetails = [...currentDetails];
    
    // 添加新选择的文件
    for (const file of files) {
      // 检查文件是否已经存在于列表中
      const isDuplicate = currentFiles.some(existingFile => 
        existingFile.name === file.name && 
        existingFile.size === file.size && 
        existingFile.lastModified === file.lastModified
      );
      
      // 只添加不重复的文件
      if (!isDuplicate) {
        newFiles.push(file);
        newDetails.push({
          id: Math.random().toString(36).substring(2, 11),
          file
        });
      }
    }
    
    // 检查是否超过最大上传限制
    if (newFiles.length > maxUploadCount) {
      // 如果超过限制，只保留前 maxUploadCount 张图片
      const allowedFiles = newFiles.slice(0, maxUploadCount);
      const allowedDetails = newDetails.slice(0, maxUploadCount);
      
      setSelectedFiles(allowedFiles);
      setFileDetails(allowedDetails);
      setExceedsLimit(true);
      
      // 通知父组件
      if (onFilesSelected) {
        onFilesSelected(allowedDetails);
      }
    } else {
      setSelectedFiles(newFiles);
      setFileDetails(newDetails);
      setExceedsLimit(false);
      
      // 通知父组件
      if (onFilesSelected) {
        onFilesSelected(newDetails);
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    await onUpload(selectedFiles, expiryMinutes, selectedTags)
  }

  return (
    <>
      <div className="card p-8 mb-8">
        <h2 className="text-2xl font-semibold mb-6 flex items-center">
          <UploadIcon className="h-6 w-6 mr-2 text-indigo-500" />
          上传图片
        </h2>

        <form onSubmit={handleSubmit}>
          <UploadDropzone
            onFilesSelected={handleFilesSelected}
            maxUploadCount={maxUploadCount}
          />

          <ExpirySelector onChange={setExpiryMinutes} />

          <TagSelector
            selectedTags={selectedTags}
            availableTags={availableTags}
            onTagsChange={handleTagsChange}
            onNewTagCreated={fetchTags}
          />

          {exceedsLimit && (
            <div className="mb-6 p-4 rounded-xl bg-linear-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 shadow-xs">
              <div className="flex items-start">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full mr-3 shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300 mb-1">超出上传限制</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    一次最多只能上传 <span className="font-medium">{maxUploadCount}</span> 张图片。已自动选择前 {maxUploadCount} 张。
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                已选择 <span className="font-medium text-indigo-600 dark:text-indigo-400">{selectedFiles.length}</span> 张图片
              </div>
              {onTogglePreview && (
                <button
                  type="button"
                  onClick={onTogglePreview}
                  className="px-4 py-2 text-sm bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors duration-200 flex items-center font-medium"
                >
                  <ImageIcon className="h-4 w-4 mr-1.5" />
                  {isPreviewOpen ? '隐藏文件列表' : '查看文件列表'}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </>
  )
}
