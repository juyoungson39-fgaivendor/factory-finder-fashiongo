const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  return (
    <div className="flex flex-col items-start">
      <span className={size === 'lg' ? 'logo-text-lg' : 'logo-text'}>
        FASHIONGO
      </span>
      <span className="logo-sub">AI VENDOR</span>
    </div>
  );
};

export default Logo;
