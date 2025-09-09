# Log Analyzer

A powerful single-page application for analyzing JSON log files with dynamic column management, nested field parsing, and local storage persistence.

## 🚀 Features

- **JSON Log Parsing**: Paste JSON logs line by line, automatically parsed and displayed
- **Dynamic Columns**: Add custom columns for any JSON field path
- **Nested Field Support**: Access nested objects (`user.profile.name`) and arrays (`items[0].field`)
- **Column Management**: Hide/show, reorder (drag & drop), and remove columns
- **Local Storage**: Column configurations persist across browser sessions
- **Sorting**: Sort by any column (ascending/descending)
- **Responsive Design**: Clean, modern UI built with Tailwind CSS
- **SPA Mode**: Fully client-side application, no server required

## 📖 Usage Examples

### Sample JSON Logs

```json
{"user": {"name": "Alice", "age": 30}, "items": [{"id": 1}, {"id": 2}]}
{"user": {"name": "Bob", "age": 25}, "items": [{"id": 3}]}
```

### Field Path Examples

- `user.name` → "Alice", "Bob"
- `user.age` → 30, 25
- `items[0].id` → 1, 3
- `items[1].id` → 2, (empty)

## 🛠 Development

```bash
pnpm install
pnpm run dev
```

## 🚀 Deployment to GitHub Pages

This project is configured for automatic deployment to GitHub Pages:

### Setup

1. Push your code to a GitHub repository
2. Go to Settings > Pages in your repository
3. Set Source to "GitHub Actions"
4. The workflow will automatically deploy on pushes to `main`

### Manual Build

```bash
pnpm run build:gh-pages
pnpm run preview
```

### Configuration

- Repository name should match the `base` path in `svelte.config.js`
- Currently configured for repository name: `loganalyzer`
- Update `paths.base` if your repository has a different name

## 📁 Project Structure

- **Single Page App**: Fully client-side, no SSR
- **Static Build**: Optimized for GitHub Pages deployment
- **Local Storage**: Persistent column configurations
- **Modern Svelte 5**: Using latest runes and reactivity features

## 🔧 Technologies

- **Svelte 5** with runes (`$state`, `$effect`)
- **SvelteKit** with static adapter
- **Tailwind CSS** for styling
- **TypeScript** for type safety
- **Vite** for build tooling
