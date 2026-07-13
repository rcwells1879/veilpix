/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "What is VeilPix and how does it work?",
    answer: "VeilPix is a privacy-focused AI image and video creative workspace. You can generate images from text, edit photos, combine references, and create text-to-video, image-to-video, and reference-to-video clips with models including Nano Banana 2, Seedream 5, Wan 2.7, and Wan 2.6 Flash."
  },
  {
    question: "What is VeilPix After Dark?",
    answer: "VeilPix After Dark is an age-verified 18+ mode for private NSFW and adult creative workflows where supported by the selected model provider. Uploaded media is sent only for the requested generation or edit and is not stored as a user library. VeilPix still applies account controls, provider safety systems, and misuse prevention."
  },
  {
    question: "Can VeilPix generate videos?",
    answer: "Yes. VeilPix supports Wan 2.6 text-to-video, Wan 2.6 Flash image-to-video, Wan 2.7 reference-to-video, Seedance 2.0 multimodal video generation, and reference workflows that can use images, video, and audio as creative guidance."
  },
  {
    question: "What makes VeilPix different from other AI photo editors?",
    answer: "VeilPix brings image editing, text-to-image generation, and AI video generation into one private creative tool. It supports localized editing, multi-image composition, text-to-video, image-to-video, and reference-to-video without storing your photos, videos, or prompts."
  },
  {
    question: "What types of images and videos can I create?",
    answer: "You can retouch photos, remove or add objects, change colors, apply styles, adjust lighting, create images from prompts, combine reference images, generate videos from text, animate an image, or guide reference-to-video generation with uploaded media."
  },
  {
    question: "Can I use VeilPix for commercial purposes?",
    answer: "Yes. Images and videos you create with VeilPix are yours to use for personal or commercial projects, subject to the terms of the model providers and any media you upload. VeilPix does not retain ownership of your generated media."
  },
  {
    question: "How do you handle my photos, videos, and prompts?",
    answer: "Privacy is a core priority. Uploaded photos, videos, and prompts are sent only for the requested generation or edit, then discarded rather than stored as a user library. VeilPix avoids advertising trackers and is designed around private creative workflows."
  },
  {
    question: "Is VeilPix really free?",
    answer: "Yes. VeilPix is free to try with 30 credits after sign-up and no payment required. Credits can be used across supported image and video workflows, and additional credits are available without a required subscription."
  },
  {
    question: "What AI models does VeilPix use?",
    answer: "VeilPix uses Nano Banana 2, Seedream 5 Lite/Pro, and Wan 2.7 Image for image generation and editing, plus Wan 2.6, Wan 2.7, and Seedance 2.0 for video workflows."
  },
  {
    question: "What file formats does VeilPix support?",
    answer: "VeilPix supports common image formats including JPEG, PNG, WebP, and HEIC, with HEIC auto-conversion for Apple device uploads. Video reference workflows support common browser-friendly video formats such as MP4, WebM, and MOV."
  },
  {
    question: "Is VeilPix affiliated with Google?",
    answer: "No. VeilPix is an independent application that integrates third-party image and video models, including Google Gemini-powered image models. VeilPix is not affiliated with or endorsed by Google, ByteDance, Wan, or Seedance."
  }
];

const FAQ: React.FC = () => {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenItems(newOpenItems);
  };

  return (
    <div className="mt-16 w-full max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-gray-100 mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-lg text-gray-400">
          Everything you need to know about VeilPix image and video generation
        </p>
      </div>

      <div className="space-y-4">
        {faqData.map((item, index) => (
          <div
            key={index}
            className="bg-black/20 border border-gray-700/50 rounded-lg overflow-hidden backdrop-blur-sm"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-white/5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              aria-expanded={openItems.has(index)}
            >
              <h3 className="text-lg font-semibold text-gray-100 pr-4">
                {item.question}
              </h3>
              <div className="flex-shrink-0">
                <svg
                  className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${
                    openItems.has(index) ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                openItems.has(index) ? 'max-h-[34rem] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-6 pb-5 pt-0">
                <p className="text-gray-300 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FAQ;
