import { ClerkProvider } from '@clerk/clerk-react'

// Get the publishable key from environment variables
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk Publishable Key. Please add VITE_CLERK_PUBLISHABLE_KEY to your .env file.')
}

// Clerk theme configuration
const clerkTheme = {
  layout: {
    socialButtonsPlacement: 'bottom' as const,
    showOptionalFields: false
  },
  variables: {
    colorPrimary: '#E04F67',
    colorBackground: '#0A1629',
    colorText: '#E5E7EB',
    colorTextSecondary: '#9CA3AF',
    colorInputBackground: '#1F2937',
    colorInputText: '#F3F4F6',
    borderRadius: '0.5rem'
  },
  elements: {
    card: {
      backgroundColor: '#1F2937',
      borderColor: '#374151',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    },
    headerTitle: {
      color: '#F3F4F6',
      fontSize: '1.5rem',
      fontWeight: '600'
    },
    headerSubtitle: {
      color: '#9CA3AF'
    },
    socialButtonsBlockButton: {
      backgroundColor: '#374151',
      borderColor: '#4B5563',
      color: '#F3F4F6',
      '&:hover': {
        backgroundColor: '#4B5563'
      }
    },
    formButtonPrimary: {
      backgroundColor: '#E04F67',
      '&:hover': {
        backgroundColor: '#DC2626'
      }
    },
    footerActionLink: {
      color: '#E04F67',
      '&:hover': {
        color: '#DC2626'
      }
    }
  }
}

interface ClerkWrapperProps {
  children: React.ReactNode
}

export function ClerkWrapper({ children }: ClerkWrapperProps) {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={clerkTheme}
      signInFallbackRedirectUrl="/veilpix/"
      signUpFallbackRedirectUrl="/veilpix/"
      afterSignInUrl="/veilpix/"
      afterSignUpUrl="/veilpix/"
      afterSignOutUrl="/veilpix/"
    >
      {children}
    </ClerkProvider>
  )
}