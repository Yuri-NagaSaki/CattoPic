'use client'

import { useState, useEffect } from 'react'
import { ClockIcon } from './ui/icons'

interface ExpirySelectorProps {
  onChange: (minutes: number) => void
}

export default function ExpirySelector({ onChange }: ExpirySelectorProps) {
  const [selectedOption, setSelectedOption] = useState<string>('never')
  const [customValue, setCustomValue] = useState<number>(1)
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours'>('hours')

  useEffect(() => {
    onChange(0)
  }, [onChange])

  // 处理选项变更
  const handleOptionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const option = e.target.value
    setSelectedOption(option)

    let minutes = 0
    switch (option) {
      case 'never':
        minutes = 0
        break
      case '1m':
        minutes = 1
        break
      case '1h':
        minutes = 60
        break
      case '24h':
        minutes = 24 * 60
        break
      case '7d':
        minutes = 7 * 24 * 60
        break
      case '30d':
        minutes = 30 * 24 * 60
        break
      case 'custom':
        // 根据当前选择的时间单位计算分钟数
        minutes = timeUnit === 'minutes' ? customValue : customValue * 60
        break
    }
    onChange(minutes)
  }

  // 处理自定义值变更
  const handleCustomValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (!isNaN(value) && value > 0) {
      setCustomValue(value)
      if (selectedOption === 'custom') {
        // 根据当前选择的时间单位计算分钟数
        const minutes = timeUnit === 'minutes' ? value : value * 60
        onChange(minutes)
      }
    }
  }

  // 处理时间单位变更
  const handleTimeUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const unit = e.target.value as 'minutes' | 'hours'
    setTimeUnit(unit)
    if (selectedOption === 'custom') {
      // 根据新的时间单位计算分钟数
      const minutes = unit === 'minutes' ? customValue : customValue * 60
      onChange(minutes)
    }
  }

  return (
    <div className="mb-6 flex items-center space-x-4">
      <div className="flex items-center">
        <ClockIcon className="h-5 w-5 mr-2 text-indigo-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">过期时间：</span>
      </div>

      <div className="flex-1">
        <select
          value={selectedOption}
          onChange={handleOptionChange}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-sm shadow-xs"
        >
          <option value="never">永不过期</option>
          <option value="1m">1分钟</option>
          <option value="1h">1小时</option>
          <option value="24h">1天</option>
          <option value="7d">7天</option>
          <option value="30d">30天</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      {selectedOption === 'custom' && (
        <>
          <div className="w-24">
            <input
              type="number"
              min="1"
              value={customValue}
              onChange={handleCustomValueChange}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-center font-medium shadow-xs"
              aria-label="自定义时间值"
            />
          </div>
          <div className="w-24">
            <select
              value={timeUnit}
              onChange={handleTimeUnitChange}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 text-sm shadow-xs"
            >
              <option value="minutes">分钟</option>
              <option value="hours">小时</option>
            </select>
          </div>
        </>
      )}
    </div>
  )
}
