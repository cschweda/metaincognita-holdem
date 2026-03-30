export default defineAppConfig({
  ui: {
    tooltip: {
      slots: {
        content: [
          'z-50 max-w-xs',
          'bg-[#030712] text-gray-100',
          'opacity-100',
          'shadow-xl',
          'rounded-lg',
          'border border-gray-700',
          'px-4 py-3',
          'text-xs leading-relaxed',
          'select-none pointer-events-auto',
          'data-[state=delayed-open]:animate-[scale-in_100ms_ease-out]',
          'data-[state=closed]:animate-[scale-out_100ms_ease-in]',
          'origin-(--reka-tooltip-content-transform-origin)',
        ].join(' '),
        text: 'whitespace-normal text-wrap',
      },
    },
  },
})
