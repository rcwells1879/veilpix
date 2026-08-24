/*
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'What is VeilPix and how does it work?',
    answer: 'VeilPix is a privacy-focused AI image and video creative workspace. You can generate images from text, edit photos, combine references, and create text-to-video, frame-to-video, reference-to-video, file-to-video, and link-to-video clips with models including Nano Banana 2, Seedream 5 Lite/Pro, Z-Image Turbo, Wan 3.0 Standard/Prime, earlier Wan video models, and Seedance 2.5.',
  },
  {
    question: 'What is VeilPix After Dark?',
    answer: 'VeilPix After Dark is an age-verified 18+ mode for private NSFW and adult creative workflows where supported by the selected model provider. Uploaded media is sent only for the requested generation or edit and is not stored as a user library. VeilPix still applies account controls, provider safety systems, and misuse prevention.',
  },
  {
    question: 'Can VeilPix generate videos?',
    answer: 'Yes. Wan 3.0 supports clips up to 30 seconds with text, first/last frames, up to 10 reference images, 5 reference videos, 5 reference audio files, a document, or a public webpage. Choose Standard for lower cost or Prime for faster generation. Seedance 2.5 also supports multimodal clips up to 30 seconds.',
  },
  {
    question: 'How do I make a longer Seedance 2.5 video in VeilPix?',
    answer: 'Generate a Seedance 2.5 clip, select Continue from last frame below the result, write the next part of the scene, and generate again. VeilPix uses the provider-returned final frame when available or extracts a usable frame from the video, saves it to your browser-local gallery, and places it in the next clip\'s first-frame slot. Repeat the process and combine clips in the VeilPix Video Editor.',
  },
  {
    question: 'What makes VeilPix different from other AI photo editors?',
    answer: 'VeilPix brings image editing, text-to-image generation, and AI video generation into one privacy-focused creative tool. Your creation history and prompts stay in your browser instead of an account-synced VeilPix gallery, and cloud AI requests are proxied so the model gateway does not receive your direct browser IP or VeilPix account identity.',
  },
  {
    question: 'What types of images and videos can I create?',
    answer: 'You can retouch photos, remove or add objects, change colors, apply styles, adjust lighting, create images from prompts, combine reference images, generate videos from text, animate an image, or guide reference-to-video generation with uploaded media.',
  },
  {
    question: 'Can I use VeilPix for commercial purposes?',
    answer: 'Yes. Images and videos you create with VeilPix are yours to use for personal or commercial projects, subject to the terms of the model providers and any media you upload. VeilPix does not retain ownership of your generated media.',
  },
  {
    question: 'How do you handle my photos, videos, and prompts?',
    answer: 'Uploaded media and prompts are sent through VeilPix to the selected cloud AI provider for the requested generation or edit. Your creation history and prompts are saved locally in your browser rather than in a server-side VeilPix creative library. Provider retention still applies; see the VeilPix Privacy page for the current data flow and retention details.',
  },
  {
    question: 'Is VeilPix really free?',
    answer: 'Yes. VeilPix is free to try with 30 credits after sign-up and no payment required. Credits can be used across supported image and video workflows, and additional credits are available without a required subscription.',
  },
  {
    question: 'What AI models does VeilPix use?',
    answer: 'VeilPix uses Nano Banana 2, Seedream 5 Lite/Pro, and Z-Image Turbo for image generation, plus Wan 3.0 Standard/Prime, earlier Wan models, and Seedance 2.5 for video workflows.',
  },
  {
    question: 'What file formats does VeilPix support?',
    answer: 'VeilPix supports common image formats including JPEG, PNG, WebP, and HEIC, with HEIC auto-conversion for Apple device uploads. Video reference workflows support common browser-friendly video formats such as MP4, WebM, and MOV.',
  },
  {
    question: 'Is VeilPix affiliated with Google?',
    answer: 'No. VeilPix is an independent application that integrates third-party image and video models, including Google Gemini-powered image models. VeilPix is not affiliated with or endorsed by Google, ByteDance, Wan, or Seedance.',
  },
];

const FAQ: React.FC = () => (
  <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-8 pb-12 pt-8 sm:pb-16 sm:pt-12">
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-300">
          VeilPix FAQ
        </p>
        <h2 id="faq-heading" className="mt-4 text-3xl font-semibold tracking-tight text-gray-100 sm:text-5xl">
          Frequently asked questions
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
          Answers about VeilPix image editing, AI video generation, supported models, credits, formats, and privacy.
        </p>
      </header>

      <div className="mt-12 space-y-3">
        {faqData.map((item) => (
          <details key={item.question} className="edge seo-surface group rounded-2xl">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-left text-sm font-semibold text-gray-100 transition hover:text-white sm:px-6 sm:text-base [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <p className="max-w-3xl text-sm leading-7 text-gray-300 sm:text-[15px]">
                {item.answer}
              </p>
            </div>
          </details>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-gray-500">
        For complete data-handling details, read the{' '}
        <a href="/veilpix/privacy/" className="text-gray-300 underline decoration-white/20 underline-offset-4 transition hover:text-white">
          VeilPix Privacy Policy
        </a>.
      </p>
    </div>
  </section>
);

export default FAQ;
