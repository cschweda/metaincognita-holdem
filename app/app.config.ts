export default defineAppConfig({
  ui: {
    tooltip: {
      slots: {
        content: 'max-w-64 bg-gray-900 text-gray-200 shadow-lg rounded-md ring ring-gray-700 px-3 py-2 text-xs leading-relaxed select-none data-[state=delayed-open]:animate-[scale-in_100ms_ease-out] data-[state=closed]:animate-[scale-out_100ms_ease-in] origin-(--reka-tooltip-content-transform-origin) pointer-events-auto',
        text: 'whitespace-normal',
      },
    },
  },
})
