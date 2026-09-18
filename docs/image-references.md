# Image references

Provider documentation checked on 2026-09-18. These limits count **all input images**, including the image displayed on the canvas. They are the limits of the Kie endpoints VeilPix calls, not a different vendor's integration.

| Selectable model | Kie model / image field | Maximum inputs |
| --- | --- | --- |
| Nano Banana 2 | `nano-banana-2` / `image_input` | 14 |
| Seedream 5 Lite | `seedream/5-lite-image-to-image` / `image_urls` | 14 |
| Seedream 5 Pro | `seedream/5-pro-image-to-image` / `image_urls` | 10 |
| Wan 2.7 Image | `wan/2-7-image` / `input_urls` | 9 |
| Z-Image Turbo | `z-image` | 0; text only |

The authoritative array limits are `maxItems` in the OpenAPI schemas exposed by each documentation page's Markdown version:

- [Nano Banana 2](https://docs.kie.ai/market/google/nanobanana2.md)
- [Seedream 5 Lite](https://docs.kie.ai/market/seedream-5-lite-image-to-image.md)
- [Seedream 5 Pro](https://docs.kie.ai/market/seedream/5-pro-image-to-image.md)
- [Wan 2.7 Image](https://docs.kie.ai/market/wan/2-7-image.md)
- [Z-Image](https://docs.kie.ai/market/z-image/z-image)

## Prompt references

Use **Image 1, Image 2, …** in upload order. The arrays do not contain separate base, style, or subject fields. Those are roles the user assigns in their prompt. Zero-based programming indexes are not prompt labels, and these image endpoints do not document a required `@Image` token.

- [Google's image prompting guide](https://ai.google.dev/gemini-api/docs/image-generation) uses numbered images and descriptions such as the first/second image. Naming the visible subject as well as its number can make an edit more specific.
- [ByteDance's Seedream 5 Lite examples](https://seed.bytedance.com/en/blog/deeper-thinking-more-accurate-generation-introducing-seedream-5-0-lite) use numbered images for color transfer and editing.
- [ByteDance's Seedream 5 Pro examples](https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro) assign distinct material, color, subject, and composition roles to numbered images.
- [Alibaba's Wan image editing guide](https://www.alibabacloud.com/help/en/model-studio/wan-image-edit) uses numbered inputs and documents up to nine images for Wan 2.7.

VeilPix displays those numbers and prepends a short input-order explanation to multi-image prompts. It no longer adds an instruction to combine all images into a photorealistic composition. Numbering is a natural-language convention supported by these examples, not a guarantee of perfect model adherence.

## App behavior

- Image 1 is the canvas image. Additional images can supply any role requested in the prompt. Retouch coordinates apply to Image 1, with the other images still included.
- A plus tile adds the next image until the selected model's limit is reached. Each occupied tile accepts a replacement via device/Album selection, drop, or paste. The existing native mobile paste and HEIC conversion paths are reused.
- Removing an image renumbers the remaining inputs. Switching to a model with a smaller limit preserves the list and blocks generation until the user removes excess images or switches back. Z-Image ignores the image list and generates from text.
- Compression, multipart upload, temporary Storage uploads, and provider arrays preserve the displayed order. The API independently validates the selected model/tier's count.
- Additional references are stored in browser-only pending inputs and Album metadata. Legacy one-style-image records still load as Image 2. Opening a generated Album result makes that output the new Image 1 and restores its additional references. No reference blobs are added to localStorage or the account delivery outbox.
- Frontend limits live in `getImageReferenceLimit` in `components/ImageModelControlsPanel.tsx`; API limits live in `veilpix-api/utils/imageReferences.js`. The pricing check also verifies they agree.
