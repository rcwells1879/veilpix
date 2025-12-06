# Plan: Image Gallery with IndexedDB Storage

## Features
1. **Workflow persistence** (already implemented) - current editing session survives refresh
2. **Gallery of past creations** - show last 20 generated images
3. **Re-edit from gallery** - select any past image to start new edit session
4. **Manual deletion** - users can remove images from gallery

## Privacy: 100% Client-Side
- All images stored in browser's IndexedDB (user's hard drive only)
- No server upload - images never touch Supabase or any cloud
- User controls their data - cleared when they clear browser data

---

## Files to Modify/Create

### 1. Extend: `src/utils/workflowStorage.ts`
Add gallery functions:
- `saveToGallery(image: File)` - save final image with thumbnail + metadata
- `getGalleryImages()` - return last 20 images (thumbnails + metadata)
- `getGalleryImage(id)` - get full-size image for re-editing
- `deleteGalleryImage(id)` - remove specific image
- `clearGallery()` - remove all gallery images

### 2. Create: `components/Gallery.tsx`
- Grid of thumbnail images (responsive: 2-4 columns)
- Each image shows: thumbnail, date created
- Click image → load into editor for re-editing
- Delete button (X) on each image with confirmation
- "Clear All" option
- Empty state when no images

### 3. Modify: `components/StartScreen.tsx`
- Add "My Creations" section below upload area (or as tab)
- Show gallery component
- Handle image selection → pass to App for editing

### 4. Modify: `App.tsx`
- Save to gallery on file upload
- Save to gallery after every AI generation
- Handle `onSelectGalleryImage` - load image into editor

---

## Data Structure

```typescript
interface GalleryImage {
  id: string;              // UUID
  blob: Blob;              // Full-size image
  thumbnail: Blob;         // 200px thumbnail for fast loading
  createdAt: number;       // Timestamp
  name: string;            // Original/generated filename
}
```

IndexedDB stores:
- `workflow` store: current editing session (existing)
- `gallery` store: array of past images (new)

---

## Implementation Steps

1. **Add gallery storage functions** to workflowStorage.ts
   - Create thumbnail using canvas (200px max dimension)
   - Store with UUID, timestamp, and original name
   - Limit to 20 images (auto-delete oldest when exceeded)

2. **Create Gallery component**
   - Load thumbnails on mount
   - Responsive grid layout
   - Delete button with hover state
   - Click to select for re-editing

3. **Add Gallery to StartScreen**
   - Show below upload area
   - "My Creations" heading
   - Pass onSelect callback to App

4. **Wire up in App.tsx**
   - Save to gallery on upload and after every generation
   - Handle gallery image selection → start new edit session

---

## When to Save to Gallery
- **On file upload** - captures original image
- **After every AI generation** - captures each edit result

This means the gallery shows the complete history of user's work.

## UX Details
- Thumbnails load fast (small size)
- Full image only loaded when selected for editing
- Delete shows confirmation (or undo toast?)
- Gallery persists across browser sessions
- Max 20 images (oldest auto-deleted when full)
