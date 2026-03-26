/** Inline SVG logos for trend channel indicators */

export const GoogleLogo = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block flex-shrink-0">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.97-6.19A23.99 23.99 0 0 0 0 24c0 3.77.87 7.36 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

export const InstagramLogo = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block flex-shrink-0">
    <defs>
      <radialGradient id="ig" r="150%" cx="30%" cy="107%">
        <stop offset="0" stopColor="#fdf497"/>
        <stop offset=".05" stopColor="#fdf497"/>
        <stop offset=".45" stopColor="#fd5949"/>
        <stop offset=".6" stopColor="#d6249f"/>
        <stop offset=".9" stopColor="#285AEB"/>
      </radialGradient>
    </defs>
    <rect width="48" height="48" rx="12" fill="url(#ig)"/>
    <circle cx="24" cy="24" r="9" fill="none" stroke="#fff" strokeWidth="3"/>
    <circle cx="35" cy="13" r="2.5" fill="#fff"/>
    <rect x="6" y="6" width="36" height="36" rx="10" fill="none" stroke="#fff" strokeWidth="3"/>
  </svg>
);

export const AmazonLogo = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block flex-shrink-0">
    <path fill="#FF9900" d="M27.52 32.9c-6.41 4.73-15.7 7.25-23.71 7.25-2.83 0-5.6-.37-8.3-1.07a.94.94 0 0 1-.08-1.7c2.3-1.35 4.8-2.24 7.4-2.9a.64.64 0 0 1 .7.37c.11.2.04.45-.14.59-1.02.74-1.5 1.08.24.83 4.06-.73 8.24-1.84 11.97-4.07.53-.32 1.01.28.63.7z" transform="translate(6,0)"/>
    <path fill="#FF9900" d="M40 30.5c-.67-.86-4.43-.41-6.13-.2-.51.06-.59-.38-.13-.71 3-2.11 7.93-1.5 8.5-.8.58.72-.15 5.66-2.97 8.02-.43.36-.84.17-.65-.31.63-1.58 2.05-5.14 1.38-6z"/>
    <path fill="#232F3E" d="M34 20.37c0-2.93-.22-5.3-1.12-7.14a8.5 8.5 0 0 0-5.28-4.48c-1.45-.4-3.2-.59-4.64-.59-3.82 0-7.1 1.3-8.87 4.48-1.04 1.84-1.46 4.21-1.46 7.14v2.22c0 2.93.42 5.3 1.46 7.14 1.78 3.18 5.47 4.48 8.87 4.48 1.44 0 3.19-.2 4.64-.59a8.5 8.5 0 0 0 5.28-4.48c.9-1.84 1.12-4.21 1.12-7.14v-1.04zM28.1 23c0 3.5-1.5 6-4.1 6s-4.1-2.5-4.1-6v-2c0-3.5 1.5-6 4.1-6s4.1 2.5 4.1 6v2z"/>
  </svg>
);
