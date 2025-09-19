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
    question: "What is Veilpix - Nano Banana and how does it work?",
    answer: "Veilpix - Nano Banana is a free AI-powered photo editor that uses Google's advanced Nano Banana AI model to transform your images through simple text descriptions. Just upload a photo, click where you want to edit, and describe your changes in plain English."
  },
  {
    question: "What makes Veilpix - Nano Banana different from other AI photo editors?",
    answer: "Veilpix - Nano Banana offers precise localized editing - you can click specific areas of your image to make targeted changes. We also prioritize privacy by not storing your photos or prompts, and we don't use trackers or ads. Plus, it's free to try with 30 credits after signing in, and no payment details are required."
  },
  {
    question: "What types of edits can I make?",
    answer: "You can perform localized retouching (remove objects, change colors, add elements), apply creative filters and artistic styles, make professional adjustments (lighting, contrast, saturation), combine multiple images, and crop your photos. All through simple text descriptions."
  },
  {
    question: "Can I use Veilpix - Nano Banana for commercial purposes?",
    answer: "Yes! The images you create with Veilpix - Nano Banana are yours to use for any purpose, including commercial projects. We don't retain any rights to your edited photos."
  },
  {
    question: "How do you handle my photos and data?",
    answer: "Privacy is our priority. We don't store your uploaded photos or editing prompts on our servers. Images are processed in real-time and discarded immediately after editing. We also don't use cookies, trackers, or ads."
  },
  {
    question: "Is Veilpix - Nano Banana really free?",
    answer: "Yes! Veilpix - Nano Banana is free to try. Simply sign in to receive 30 free credits - no payment details required. Credits never expire and there are no recurring subscriptions. You only pay if you choose to purchase additional credits."
  },
  {
    question: "What file formats do you support?",
    answer: "Veilpix - Nano Banana supports all common image formats including JPEG, PNG, WebP, and even HEIC files from Apple devices. HEIC files are automatically converted to ensure compatibility."
  },
  {
    question: "Do I need to create an account?",
    answer: "Yes, you need to sign in to use Veilpix - Nano Banana, but it's completely free and you'll receive 30 credits immediately upon registration. No payment details are required unless you want to purchase additional credits."
  },
  {
    question: "Is Veilpix - Nano Banana affiliated with Google?",
    answer: "No, Veilpix - Nano Banana is an independent application that uses Google's publicly available Nano Banana AI API. We are not affiliated with or endorsed by Google."
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
          Everything you need to know about Veilpix - Nano Banana
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
                openItems.has(index) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
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