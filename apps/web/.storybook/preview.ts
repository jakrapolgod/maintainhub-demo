import type { Preview } from '@storybook/react'
import '../app/globals.css'

const preview: Preview = {
  parameters: {
    controls:  { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    nextjs:    { appDirectory: true },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: 'hsl(0 0% 100%)' },
        { name: 'dark',  value: 'hsl(222.2 84% 4.9%)' },
      ],
    },
  },
}

export default preview
