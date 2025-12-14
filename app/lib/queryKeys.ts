export const queryKeys = {
  // Image related keys
  images: {
    all: ['images'] as const,
    lists: () => [...queryKeys.images.all, 'list'] as const,
    list: (filters: { page?: number; limit?: number; tag?: string; orientation?: string }) =>
      [...queryKeys.images.lists(), filters] as const,
    recentUploads: () => [...queryKeys.images.all, 'recentUploads'] as const,
    details: () => [...queryKeys.images.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.images.details(), id] as const,
  },

  // Tag related keys
  tags: {
    all: ['tags'] as const,
    list: () => [...queryKeys.tags.all, 'list'] as const,
  },

  // Config
  config: {
    all: ['config'] as const,
  },
} as const;
