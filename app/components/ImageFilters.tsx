import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ImageFiltersProps } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../utils/request";
import { ChevronDownIcon, MagnifyingGlassIcon, MixerHorizontalIcon } from "./ui/icons";

export default function ImageFilters({ onFilterChange }: ImageFiltersProps) {
  const [format, setFormat] = useState("webp");
  const [orientation, setOrientation] = useState("all");
  const [tag, setTag] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  
  const [activeDropdown, setActiveDropdown] = useState<"format" | "orientation" | "tag" | null>(null);

  const dropdownRefs = {
    format: useRef<HTMLDivElement>(null),
    orientation: useRef<HTMLDivElement>(null),
    tag: useRef<HTMLDivElement>(null)
  };

  const panelRef = useRef<HTMLDivElement>(null);

  const formatOptions = useMemo(() => [
    { value: "webp", label: "图片" },
    { value: "gif", label: "GIF" }
  ], []);

  const orientationOptions = useMemo(() => [
    { value: "all", label: "方向" },
    { value: "landscape", label: "横向" },
    { value: "portrait", label: "纵向" }
  ], []);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await api.get<{ success: boolean; tags: { name: string; count: number }[] }>("/api/tags");
        if (response.success && response.tags && response.tags.length > 0) {
          setAvailableTags(response.tags.map(t => t.name));
        }
      } catch (error) {
        console.error("获取标签失败:", error);
      }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current && 
        !panelRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest('.filter-toggle-button')
      ) {
        setIsFilterPanelOpen(false);
        setActiveDropdown(null);
      }
      
      if (!Object.values(dropdownRefs).some(ref => 
        ref.current && ref.current.contains(event.target as Node)
      )) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFilterChange = useCallback((type: string, value: string) => {
    switch (type) {
      case "format":
        setFormat(value);
        onFilterChange(value, orientation, tag);
        break;
      case "orientation":
        setOrientation(value);
        onFilterChange(format, value, tag);
        break;
      case "tag":
        setTag(value);
        onFilterChange(format, orientation, value);
        break;
    }
    setActiveDropdown(null);
  }, [format, orientation, tag, onFilterChange]);

  const filteredTags = useMemo(() => 
    searchQuery.trim() === ""
      ? availableTags
      : availableTags.filter(t => 
          t.toLowerCase().includes(searchQuery.toLowerCase())
        ),
    [availableTags, searchQuery]
  );

  const renderFilterOption = useCallback((type: "format" | "orientation" | "tag") => {
    const getOptionLabel = () => {
      switch (type) {
        case "format":
          return formatOptions.find(opt => opt.value === format)?.label || "选择格式";
        case "orientation":
          return orientationOptions.find(opt => opt.value === orientation)?.label || "选择方向";
        case "tag":
          return tag || "选择标签";
      }
    };

    const getOptions = () => {
      switch (type) {
        case "format":
          return formatOptions;
        case "orientation":
          return orientationOptions;
        case "tag":
          return filteredTags.map(t => ({ value: t, label: t }));
      }
    };

    const isActive = activeDropdown === type;

    return (
      <div className="relative" ref={dropdownRefs[type]}>
        <button
          onClick={() => setActiveDropdown(isActive ? null : type)}
          className={`w-full px-4 py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-between ${
            isActive
              ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
              : "bg-slate-200 dark:bg-gray-800/40 text-slate-700 dark:text-gray-300 hover:bg-slate-300 dark:hover:bg-gray-800/60 backdrop-blur-md border border-slate-300/50 dark:border-transparent"
          }`}
        >
          <span className="font-medium">{getOptionLabel()}</span>
          <motion.div
            animate={{ rotate: isActive ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDownIcon className="h-4 w-4" />
          </motion.div>
        </button>

        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 bottom-full mb-2 w-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg rounded-xl shadow-xl border border-gray-200 dark:border-gray-700/50 z-50 overflow-hidden"
            >
              {type === "tag" && (
                <div className="p-2 border-b border-gray-200 dark:border-gray-700/50">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索标签..."
                      className="w-full px-3 py-2 pl-9 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    />
                    <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                  </div>
                </div>
              )}

              <div className={`${type === "tag" ? "max-h-60" : ""} overflow-y-auto`}>
                {type === "tag" && (
                  <button
                    onClick={() => handleFilterChange("tag", "")}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                      tag === ""
                        ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    全部
                  </button>
                )}
                {getOptions().map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleFilterChange(type, option.value)}
                    className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                      (type === "format" && format === option.value) ||
                      (type === "orientation" && orientation === option.value) ||
                      (type === "tag" && tag === option.value)
                        ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                {type === "tag" && filteredTags.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                    未找到匹配的标签
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }, [activeDropdown, format, orientation, tag, formatOptions, orientationOptions, filteredTags, searchQuery, handleFilterChange]);

  return (
    <>
      <motion.button
        onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
        className="filter-toggle-button fixed bottom-6 right-6 z-50 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full p-3.5 shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:scale-110"
        whileHover={{ rotate: 90 }}
        whileTap={{ scale: 0.9 }}
      >
        <MixerHorizontalIcon className="h-5 w-5" />
      </motion.button>

      <AnimatePresence>
        {isFilterPanelOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-20 right-6 z-40 bg-white dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800/50 p-4 w-72"
          >
            <div className="space-y-3">
              {renderFilterOption("format")}
              {renderFilterOption("orientation")}
              {renderFilterOption("tag")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
