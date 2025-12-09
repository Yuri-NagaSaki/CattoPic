'use client'

import { useState } from 'react'
import { TagIcon, PlusIcon, Cross1Icon } from '../ui/icons'

interface TagSelectorProps {
  selectedTags: string[]
  availableTags: string[]
  onTagsChange: (tags: string[]) => void
  onNewTagCreated?: () => void
}

export default function TagSelector({ selectedTags, availableTags, onTagsChange, onNewTagCreated }: TagSelectorProps) {
  const [inputTag, setInputTag] = useState('')

  // 处理标签选择变更
  const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tag = e.target.value
    if (tag && !selectedTags.includes(tag)) {
      onTagsChange([...selectedTags, tag])
    }
    // 重置选择框
    e.target.value = ''
  }

  // 处理标签移除
  const handleRemoveTag = (tag: string) => {
    onTagsChange(selectedTags.filter(t => t !== tag))
  }

  // 处理自定义标签输入
  const handleTagInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputTag(e.target.value)
  }

  // 添加自定义标签
  const handleAddTag = () => {
    if (inputTag.trim() && !selectedTags.includes(inputTag.trim())) {
      onTagsChange([...selectedTags, inputTag.trim()])
      setInputTag('')
      // 通知父组件有新标签被创建
      if (onNewTagCreated) {
        onNewTagCreated()
      }
    }
  }

  // 处理回车键添加标签
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center space-x-4 mb-2">
        <div className="flex items-center">
          <TagIcon className="h-5 w-5 mr-2 text-indigo-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">标签：</span>
        </div>

        <div className="flex-1 flex space-x-2">
          <select
            onChange={handleTagChange}
            value=""
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-sm shadow-xs"
          >
            <option value="">选择标签...</option>
            {availableTags
              .filter(tag => !selectedTags.includes(tag))
              .map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
          </select>

          <div className="flex">
            <input
              type="text"
              value={inputTag}
              onChange={handleTagInput}
              onKeyDown={handleKeyDown}
              placeholder="自定义标签"
              className="px-3 py-2 rounded-l-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-sm shadow-xs"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-3 py-2 rounded-r-lg bg-linear-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-medium transition-colors duration-200 text-sm flex items-center"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedTags.map(tag => (
            <div
              key={tag}
              className="bg-linear-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center shadow-xs"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-1.5 rounded-full p-0.5 hover:bg-white/20 transition-colors"
              >
                <Cross1Icon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}