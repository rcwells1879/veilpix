/*
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import BeforeAfterShowcase from '../BeforeAfterShowcase';
import FAQ from '../FAQ';

const StudioBelowFold: React.FC = () => (
  <div className="seo-below-fold relative" aria-label="Learn more about VeilPix">
    <div
      aria-hidden="true"
      className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-white/15 to-transparent"
    />
    <BeforeAfterShowcase />
    <FAQ />
  </div>
);

export default StudioBelowFold;
