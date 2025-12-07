/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const SparkleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z"
      clipRule="evenodd"
    />
  </svg>
);

// Showcase example data structure
interface ShowcaseExample {
  id: string;
  title: string;
  highlightWord: string;
  prompt: string;
  before: {
    image: string;
    alt: string;
  };
  after: {
    image: string;
    alt: string;
  };
  caption: string;
}

const showcaseExamples: ShowcaseExample[] = [
  {
    id: 'car-transformation',
    title: 'Instant Transformation',
    highlightWord: 'Transformation',
    prompt: "replace the teenager's busted old car with an audi sports car",
    before: {
      image: 'civic',
      alt: 'Before: Teenager looking dejected next to an old dusty Honda Civic'
    },
    after: {
      image: 'audi',
      alt: 'After: Same teenager now happy in a suit next to a sleek Audi R8 sports car'
    },
    caption: 'One prompt. Total transformation.'
  },
  {
    id: '3d-model',
    title: 'Create Stunning 3D Models',
    highlightWord: '3D Models',
    prompt: 'transform this floor plan blueprint into a photorealistic 3D rendered model with furniture and landscaping',
    before: {
      image: 'blueprint',
      alt: 'Before: 2D architectural floor plan blueprint showing room layout'
    },
    after: {
      image: '3d-model',
      alt: 'After: Stunning 3D rendered model of the same floor plan with realistic furniture, textures, and pool'
    },
    caption: 'From blueprint to reality in seconds.'
  },
  {
    id: 'viewpoint-change',
    title: 'Change Your Viewpoint',
    highlightWord: 'Viewpoint',
    prompt: 'show me the view from the back deck looking out at the yard',
    before: {
      image: '3dfloorplan',
      alt: 'Before: 3D aerial view of a home floor plan with pool and landscaping'
    },
    after: {
      image: 'deckview',
      alt: 'After: Eye-level view from the back deck looking out at the yard and pool'
    },
    caption: 'Any perspective, instantly.'
  }
];

interface ShowcaseItemProps {
  example: ShowcaseExample;
  basePath: string;
}

const ShowcaseItem: React.FC<ShowcaseItemProps> = ({ example, basePath }) => {
  // Split title to highlight the keyword
  const titleParts = example.title.split(example.highlightWord);

  return (
    <div className="bg-black/20 border border-gray-700/50 rounded-xl p-4 sm:p-6 md:p-8">
      {/* Section Title */}
      <h3 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-6 text-center">
        {titleParts[0]}
        <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          {example.highlightWord}
        </span>
        {titleParts[1] || ''}
      </h3>

      {/* Fake Prompt Input */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 bg-gray-800/50 border border-gray-600 rounded-lg px-4 py-3">
          <SparkleIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <p className="text-gray-300 italic text-sm sm:text-base leading-relaxed">
            "{example.prompt}"
          </p>
        </div>
      </div>

      {/* Before/After Images Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Before Image */}
        <div className="relative group">
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-gray-800/90 backdrop-blur-sm text-gray-300 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full border border-gray-600/50">
              BEFORE
            </span>
          </div>
          <div className="overflow-hidden rounded-lg shadow-lg">
            <picture>
              <source
                srcSet={`${basePath}showcase/${example.before.image}-400w.webp 400w, ${basePath}showcase/${example.before.image}-800w.webp 800w`}
                sizes="(max-width: 768px) 100vw, 50vw"
                type="image/webp"
              />
              <img
                src={`${basePath}showcase/${example.before.image}-800w.webp`}
                alt={example.before.alt}
                loading="lazy"
                decoding="async"
                className="w-full h-auto aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </picture>
          </div>
        </div>

        {/* After Image */}
        <div className="relative group">
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-gradient-to-r from-blue-500 to-cyan-400 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg shadow-blue-500/20">
              AFTER
            </span>
          </div>
          <div className="overflow-hidden rounded-lg shadow-lg ring-1 ring-blue-500/20">
            <picture>
              <source
                srcSet={`${basePath}showcase/${example.after.image}-400w.webp 400w, ${basePath}showcase/${example.after.image}-800w.webp 800w`}
                sizes="(max-width: 768px) 100vw, 50vw"
                type="image/webp"
              />
              <img
                src={`${basePath}showcase/${example.after.image}-800w.webp`}
                alt={example.after.alt}
                loading="lazy"
                decoding="async"
                className="w-full h-auto aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            </picture>
          </div>
        </div>
      </div>

      {/* Subtle Caption */}
      <p className="text-center text-gray-500 text-sm mt-6">
        {example.caption}
      </p>
    </div>
  );
};

const BeforeAfterShowcase: React.FC = () => {
  // Use Vite's base URL for correct asset paths in both dev and production
  const basePath = import.meta.env.BASE_URL || '/';

  return (
    <section className="mt-16 w-full">
      {/* Main Section Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-100 mb-3">
          See the <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Magic</span> in Action
        </h2>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Watch how simple text prompts transform reality
        </p>
      </div>

      {/* Showcase Examples */}
      <div className="flex flex-col gap-8">
        {showcaseExamples.map((example) => (
          <ShowcaseItem key={example.id} example={example} basePath={basePath} />
        ))}
      </div>
    </section>
  );
};

export default BeforeAfterShowcase;
