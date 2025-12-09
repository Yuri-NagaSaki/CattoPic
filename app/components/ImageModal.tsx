"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { ImageFile } from "../types";
import { ImageData } from "../types/image";
import { ImageInfo } from "./ImageInfo";
import { ImageUrls } from "./ImageUrls";
import { DeleteConfirm } from "./DeleteConfirm";
import { Cross1Icon, TrashIcon, InfoCircledIcon, Link1Icon, CameraIcon } from "./ui/icons";

// 统一的图片类型，可以接受管理界面和上传界面的两种不同图片对象
type ImageType = ImageFile | (ImageData & { status: 'success' });

interface ImageModalProps {
  image: ImageType | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => Promise<void>;
}

export default function ImageModal({ image, isOpen, onClose, onDelete }: ImageModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    if (!image || !onDelete || !image.id) return;

    try {
      setIsDeleting(true);
      await onDelete(image.id);
      setShowDeleteConfirm(false);  
      onClose();  
    } catch (err) {
      console.error("删除失败:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!image) return null;

  // 判断是否有可删除的功能
  const canDelete = onDelete && image.id;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={onClose}
        >
          <div
            className="relative bg-white dark:bg-gray-900 rounded-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] shadow-xl border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <CameraIcon className="h-6 w-6 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{image.originalName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">图片详细信息</p>
                </div>
              </div>
              <button
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={onClose}
              >
                <Cross1Icon className="h-5 w-5" />
              </button>
            </div>

            {/* 内容区域 */}
            <div className="overflow-y-auto max-h-[calc(90vh-12rem)] p-6 space-y-8">
              {/* 图片信息 */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <InfoCircledIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">图片信息</h4>
                </div>
                <ImageInfo image={image as any} />
              </div>

              {/* 可用链接 */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <Link1Icon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">可用链接</h4>
                </div>
                <ImageUrls image={image as any} />
              </div>
            </div>

            {/* 底部操作区域 */}
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              {canDelete && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <TrashIcon className="h-4 w-4 mr-2 inline" />
                  删除图片
                </button>
              )}
              
              {showDeleteConfirm && (
                <div className="flex gap-2">
                  <DeleteConfirm
                    isDeleting={isDeleting}
                    onCancel={() => setShowDeleteConfirm(false)}
                    onConfirm={handleDelete}
                  />
                </div>
              )}
              
              {(!canDelete || !showDeleteConfirm) && <div />}
              
              <button
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}