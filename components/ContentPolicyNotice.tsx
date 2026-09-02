import React from 'react';

interface ContentPolicyNoticeProps {
  hasPurchasedCredits: boolean;
  nsfwFilterEnabled: boolean;
}

export const ContentPolicyNotice: React.FC<ContentPolicyNoticeProps> = ({ hasPurchasedCredits, nsfwFilterEnabled }) => (
  <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-gray-300">
    {hasPurchasedCredits && !nsfwFilterEnabled ? (
      <p>
        The AI provider blocked this request even though VeilPix After Dark is already enabled.
        The selected model may enforce content restrictions that cannot be disabled.
      </p>
    ) : hasPurchasedCredits ? (
      <p>
        The AI provider flagged this request while the content filter is enabled. For supported
        consensual adult content, open Settings and enable VeilPix After Dark to disable the
        content filter. Individual providers may still enforce their own restrictions.
      </p>
    ) : (
      <p>
        The AI provider flagged this request as potentially adult content. For supported consensual
        adult content, you must be 18+, complete age verification, and purchase credits. Then open
        Settings and enable VeilPix After Dark to disable the content filter. Individual providers
        may still enforce their own restrictions.
      </p>
    )}
    <p className="text-xs font-medium text-gray-400">
      VeilPix strictly prohibits child sexual abuse material (CSAM) and non-consensual intimate
      imagery under all circumstances. Read the{' '}
      <a
        href="/veilpix/terms/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-200 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Terms of Service
      </a>.
    </p>
  </div>
);
