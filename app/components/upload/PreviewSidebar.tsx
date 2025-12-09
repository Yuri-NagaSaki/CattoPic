'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { 
  ImageIcon, 
  FileIcon, 
  Cross1Icon, 
  TrashIcon, 
  UploadIcon,
  Spinner
} from '../ui/icons'

interface ImageFile {
  id: string
  file: File
}

interface PreviewSidebarProps {
  files: ImageFile[]
  onRemoveFile: (id: string) => void
  onRemoveAll: () => void
  isOpen: boolean
  onClose: () => void
  onUpload: () => void
  isUploading: boolean
}

// 将文件大小转换为可读格式
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取文件图标
const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase()
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'avif':
    case 'bmp':
      return <ImageIcon className="h-10 w-10 text-indigo-400" />
    default:
      return <FileIcon className="h-10 w-10 text-gray-400" />
  }
}

export default function PreviewSidebar({ 
  files, 
  onRemoveFile, 
  onRemoveAll, 
  isOpen, 
  onClose,
  onUpload,
  isUploading
}: PreviewSidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed top-0 right-0 w-full sm:w-96 h-full bg-indigo-100/10 dark:bg-slate-800/20 shadow-xl z-30 border-l border-slate-200/50 dark:border-slate-700/50 overflow-hidden flex flex-col"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          {/* 侧边栏头部 */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-slate-700/50 bg-indigo-600 text-white">
            <h2 className="text-lg font-semibold flex items-center">
              <ImageIcon className="h-5 w-5 mr-2 text-white opacity-90" />
              待上传图片 ({files.length})
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <Cross1Icon className="h-5 w-5" />
            </button>
          </div>

          {/* 侧边栏内容 */}
          <div className="flex-1 overflow-y-auto p-4">
            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400 p-6">
                <ImageIcon className="h-16 w-16 mb-4 text-slate-300 dark:text-slate-600" />
                <p className="text-lg font-medium mb-2">暂无文件</p>
                <p className="text-sm">选择要上传的文件后会显示在这里</p>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file, index) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group flex items-center p-3 bg-slate-200/50 dark:bg-slate-700/30 rounded-lg border border-slate-300/30 dark:border-slate-600/30 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-all duration-200"
                  >
                    <div className="shrink-0 mr-3">
                      <div className="w-12 h-12 flex items-center justify-center overflow-hidden bg-indigo-100 dark:bg-indigo-900/20 rounded-lg">
                        <ImageIcon className="h-8 w-8 text-indigo-400" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {file.file.name}
                      </p>
                      <div className="flex items-center mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(file.file.size)}
                        </span>
                        {file.file.type && (
                          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                            {file.file.type.split('/')[1].toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="shrink-0 p-2 rounded-full text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          {files.length > 0 && (
            <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/50">
              <div className="flex space-x-2">
                <button
                  onClick={onRemoveAll}
                  className="px-4 py-2 flex items-center justify-center bg-white hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors duration-200 font-medium border border-slate-200 dark:border-slate-600"
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  清除全部
                </button>
                <button
                  onClick={onUpload}
                  disabled={isUploading}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <Spinner className="-ml-1 mr-2 h-5 w-5 text-white" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="h-5 w-5 mr-2" />
                      开始上传
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
} 