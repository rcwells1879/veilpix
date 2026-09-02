/*
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface ShowcaseExample {
  id: string;
  title: string;
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
    title: 'Transform a complete scene',
    prompt: "Replace the teenager's busted old car with an Audi sports car",
    before: {
      image: 'civic',
      alt: 'Before AI edit: a teenager standing beside an old dusty Honda Civic',
    },
    after: {
      image: 'audi',
      alt: 'After VeilPix AI edit: the same person standing beside a sleek Audi R8 sports car',
    },
    caption: 'One prompt can replace an object while preserving the composition and subject.',
  },
  {
    id: '3d-model',
    title: 'Turn plans into visual concepts',
    prompt: 'Transform this floor plan blueprint into a photorealistic 3D rendered model with furniture and landscaping',
    before: {
      image: 'blueprint',
      alt: 'Before AI edit: a two-dimensional architectural floor plan blueprint',
    },
    after: {
      image: '3d-model',
      alt: 'After VeilPix AI generation: a furnished photorealistic 3D model based on the floor plan',
    },
    caption: 'Use a reference image and natural language to explore a design before it is built.',
  },
  {
    id: 'viewpoint-change',
    title: 'Explore a new point of view',
    prompt: 'Show me the view from the back deck looking out at the yard',
    before: {
      image: '3dfloorplan',
      alt: 'Before AI edit: an aerial 3D view of a house, yard, pool, and landscaping',
    },
    after: {
      image: 'deckview',
      alt: 'After VeilPix AI edit: an eye-level view from the back deck toward the yard and pool',
    },
    caption: 'Reframe a reference from another perspective while retaining its visual details.',
  },
];

interface ExampleImageProps {
  basePath: string;
  image: string;
  alt: string;
  label: 'Before' | 'After';
}

const ExampleImage: React.FC<ExampleImageProps> = ({ basePath, image, alt, label }) => (
  <div className="relative min-w-0 overflow-hidden rounded-xl bg-black/35">
    <span
      className={`absolute left-2.5 top-2.5 z-10 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] backdrop-blur-md ${
        label === 'After'
          ? 'bg-[#E04F67]/90 text-white'
          : 'bg-black/65 text-gray-300'
      }`}
    >
      {label}
    </span>
    <picture>
      <source
        srcSet={`${basePath}showcase/${image}-400w.webp 400w, ${basePath}showcase/${image}-800w.webp 800w`}
        sizes="(min-width: 1280px) 18vw, (min-width: 768px) 42vw, 44vw"
        type="image/webp"
      />
      <img
        src={`${basePath}showcase/${image}-800w.webp`}
        alt={alt}
        width="800"
        height="597"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="aspect-[800/597] h-auto w-full object-cover transition-transform duration-500 motion-safe:hover:scale-[1.025]"
      />
    </picture>
  </div>
);

const ShowcaseItem: React.FC<{ example: ShowcaseExample; basePath: string }> = ({ example, basePath }) => (
  <article className="edge seo-surface flex h-full flex-col rounded-3xl p-4 sm:p-5">
    <div className="flex-1">
      <h3 className="text-lg font-semibold tracking-tight text-gray-100 sm:text-xl">
        {example.title}
      </h3>
      <div className="mt-4 flex min-h-20 items-start gap-3 rounded-2xl bg-black/20 px-3.5 py-3 text-sm leading-relaxed text-gray-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-300"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 .8 2.8a4.7 4.7 0 0 0 3.3 3.3L19 10l-2.9.8a4.7 4.7 0 0 0-3.3 3.3L12 17l-.8-2.9a4.7 4.7 0 0 0-3.3-3.3L5 10l2.9-.9a4.7 4.7 0 0 0 3.3-3.3L12 3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m18.5 15 .4 1.2a2.4 2.4 0 0 0 1.5 1.5l1.1.3-1.1.4a2.4 2.4 0 0 0-1.5 1.5l-.4 1.1-.4-1.1a2.4 2.4 0 0 0-1.5-1.5l-1.1-.4 1.1-.3a2.4 2.4 0 0 0 1.5-1.5l.4-1.2Z" />
        </svg>
        <p>&ldquo;{example.prompt}&rdquo;</p>
      </div>
    </div>

    <figure className="mt-4">
      <div className="grid grid-cols-2 gap-2.5">
        <ExampleImage basePath={basePath} image={example.before.image} alt={example.before.alt} label="Before" />
        <ExampleImage basePath={basePath} image={example.after.image} alt={example.after.alt} label="After" />
      </div>
      <figcaption className="px-1 pt-3 text-xs leading-relaxed text-gray-500">
        {example.caption}
      </figcaption>
    </figure>
  </article>
);

const BeforeAfterShowcase: React.FC = () => {
  const basePath = import.meta.env.BASE_URL || '/';

  return (
    <section id="examples" aria-labelledby="examples-heading" className="scroll-mt-8 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-300">
            AI image editing examples
          </p>
          <h2 id="examples-heading" className="mt-4 text-3xl font-semibold tracking-tight text-gray-100 sm:text-5xl">
            See what a single prompt can do
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
            Edit photos, transform architectural references, and explore new perspectives with natural-language instructions in VeilPix.
          </p>
        </header>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {showcaseExamples.map((example) => (
            <ShowcaseItem key={example.id} example={example} basePath={basePath} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default BeforeAfterShowcase;
