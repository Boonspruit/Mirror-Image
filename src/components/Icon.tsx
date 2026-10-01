type IconName = 'camera' | 'image' | 'lock'

export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox={name === 'camera' ? '1 3 22 19' : name === 'image' ? '0 0 24 20' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'camera' && <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13.5" r="4" /></>}
    {name === 'image' && <><rect x="1" y="1" width="22" height="18" rx="2" /><circle cx="16.5" cy="6.5" r="1.7" /><path d="m1 17 7-8 8 8 3-3 4 5" /></>}
    {name === 'lock' && <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}
  </svg>
}
