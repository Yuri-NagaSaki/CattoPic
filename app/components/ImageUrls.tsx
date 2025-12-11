"use client";

import { useState } from "react";
import { ImageFile } from "../types";
import { ImageData } from "../types/image";
import { buildMarkdownLink } from "../utils/imageUtils";
import { copyToClipboard } from "../utils/clipboard";
import { getFullUrl } from "../utils/baseUrl";
import { CheckIcon, CopyIcon, CameraIcon, SparklesIcon, ZapIcon, CodeIcon, ChevronDownIcon, ChevronUpIcon } from "./ui/icons";

type ImageType = ImageFile | (ImageData & { status: 'success' });

interface ImageUrlsProps {
  image: ImageType;
}

// 主链接卡片组件 - 突出显示推荐链接
const PrimaryUrlCard = ({
  icon: IconComponent,
  label,
  description,
  url,
  isCopied,
  onCopy,
  accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  url: string;
  isCopied: boolean;
  onCopy: () => void;
  accentColor: string;
}) => {
  const colorClasses: Record<string, { bg: string; border: string; iconBg: string; icon: string; button: string; buttonHover: string }> = {
    purple: {
      bg: 'bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/20',
      border: 'border-violet-200/80 dark:border-violet-800/60',
      iconBg: 'bg-violet-100 dark:bg-violet-900/60',
      icon: 'text-violet-600 dark:text-violet-400',
      button: 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500',
      buttonHover: 'ring-violet-500/30'
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 dark:from-blue-950/40 dark:via-sky-950/30 dark:to-cyan-950/20',
      border: 'border-blue-200/80 dark:border-blue-800/60',
      iconBg: 'bg-blue-100 dark:bg-blue-900/60',
      icon: 'text-blue-600 dark:text-blue-400',
      button: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500',
      buttonHover: 'ring-blue-500/30'
    },
  };

  const colors = colorClasses[accentColor] || colorClasses.purple;

  return (
    <div className={`relative overflow-hidden rounded-xl border ${colors.border} ${colors.bg} p-4 transition-all duration-200 hover:shadow-md`}>
      {/* 推荐标签 */}
      <div className="absolute top-0 right-0">
        <div className="bg-gradient-to-l from-violet-500 to-purple-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-lg shadow-sm">
          推荐
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <IconComponent className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{label}</h4>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{description}</p>

          {/* URL 预览 */}
          <div className="bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 mb-3 border border-gray-200/50 dark:border-gray-700/50">
            <code className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all line-clamp-2">
              {url}
            </code>
          </div>

          {/* 复制按钮 */}
          <button
            onClick={onCopy}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all duration-200 ${colors.button} focus:outline-none focus:ring-2 ${colors.buttonHover} focus:ring-offset-2 dark:focus:ring-offset-gray-900`}
          >
            {isCopied ? (
              <>
                <CheckIcon className="w-4 h-4" />
                已复制
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4" />
                一键复制链接
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// 次要链接行组件 - 紧凑展示
const SecondaryUrlRow = ({
  icon: IconComponent,
  label,
  url,
  isCopied,
  onCopy,
  accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  url: string;
  isCopied: boolean;
  onCopy: () => void;
  accentColor: string;
}) => {
  const colorClasses: Record<string, { icon: string; copyBtn: string }> = {
    blue: { icon: 'text-blue-500', copyBtn: 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    green: { icon: 'text-emerald-500', copyBtn: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
    amber: { icon: 'text-amber-500', copyBtn: 'hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  };

  const colors = colorClasses[accentColor] || colorClasses.blue;

  return (
    <div className="group flex items-center gap-3 p-3 rounded-lg bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <IconComponent className={`w-4 h-4 flex-shrink-0 ${colors.icon}`} />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
          {url}
        </div>
      </div>
      <button
        onClick={onCopy}
        className={`flex-shrink-0 p-2 rounded-md transition-colors ${colors.copyBtn}`}
        title="复制链接"
      >
        {isCopied ? (
          <CheckIcon className="w-4 h-4 text-green-500" />
        ) : (
          <CopyIcon className="w-4 h-4 opacity-60 group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
};

export const ImageUrls = ({ image }: ImageUrlsProps) => {
  const [copyStates, setCopyStates] = useState<Record<string, boolean>>({});
  const [showAllLinks, setShowAllLinks] = useState(false);

  const handleCopy = (text: string, type: string) => {
    copyToClipboard(text)
      .then((success) => {
        if (success) {
          setCopyStates({ [type]: true });
          setTimeout(() => setCopyStates({ [type]: false }), 2000);
        }
      })
      .catch(console.error);
  };

  // 获取URL
  const originalUrl = getFullUrl(image.urls?.original || "");
  const webpUrl = getFullUrl(image.urls?.webp || "");
  const avifUrl = getFullUrl(image.urls?.avif || "");
  const format = (image.format || "").toLowerCase();

  // 确定推荐链接
  const isGif = format === "gif";
  const recommendedUrl = isGif ? originalUrl : webpUrl;
  const recommendedType = isGif ? "original" : "webp";

  // Markdown 始终优先使用 WebP 格式（GIF 除外）
  const markdownUrl = isGif ? originalUrl : (webpUrl || originalUrl);
  const markdownLink = buildMarkdownLink(markdownUrl!, image.originalName || '');

  // 构建次要链接列表
  const secondaryLinks = [
    !isGif && { icon: CameraIcon, label: '原始格式', url: originalUrl!, type: 'original', color: 'blue' },
    !isGif && { icon: ZapIcon, label: 'AVIF格式 (更小体积)', url: avifUrl!, type: 'avif', color: 'green' },
    { icon: CodeIcon, label: 'Markdown', url: markdownLink, type: 'markdown', color: 'amber' },
  ].filter(Boolean) as Array<{ icon: React.ComponentType<{ className?: string }>; label: string; url: string; type: string; color: string }>;

  return (
    <div className="space-y-4">
      {/* 推荐链接 - 主卡片 */}
      <PrimaryUrlCard
        icon={isGif ? CameraIcon : SparklesIcon}
        label={isGif ? 'GIF 动图链接' : 'WebP 格式 (推荐)'}
        description={isGif ? '保持动画效果的原始 GIF 文件' : '最佳兼容性与压缩率，适合大多数场景'}
        url={recommendedUrl!}
        isCopied={copyStates[recommendedType] || false}
        onCopy={() => handleCopy(recommendedUrl!, recommendedType)}
        accentColor={isGif ? 'blue' : 'purple'}
      />

      {/* 其他链接 - 可折叠区域 */}
      {secondaryLinks.length > 0 && (
        <div>
          <button
            onClick={() => setShowAllLinks(!showAllLinks)}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-3"
          >
            {showAllLinks ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
            {showAllLinks ? '收起其他链接' : `展开其他链接 (${secondaryLinks.length})`}
          </button>

          {showAllLinks && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
              {secondaryLinks.map((link) => (
                <SecondaryUrlRow
                  key={link.type}
                  icon={link.icon}
                  label={link.label}
                  url={link.url}
                  isCopied={copyStates[link.type] || false}
                  onCopy={() => handleCopy(link.url, link.type)}
                  accentColor={link.color}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
