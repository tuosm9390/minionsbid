// Cyber-Pixel UI에서 사용할 로컬 SVG 아이콘 세트
import React from "react";

export interface CyberIconProps extends Omit<
  React.SVGProps<SVGSVGElement>,
  "width" | "height"
> {
  size?: number;
  strokeWidth?: number;
}

export type CyberIcon = React.ComponentType<CyberIconProps>;

function defineIcon(body: React.ReactNode): CyberIcon {
  const Icon = ({
    size = 24,
    strokeWidth = 2,
    color = "currentColor",
    ...props
  }: CyberIconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden={props["aria-hidden"]}
      {...props}
    >
      <g
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {body}
      </g>
    </svg>
  );

  Icon.displayName = "CyberIcon";
  return Icon;
}

export const Check = defineIcon(
  <>
    <path d="M5 12.5L10 17.5L19 6.5" />
  </>,
);

export const CheckSquare = defineIcon(
  <>
    <path d="M4 4H20V20H4V4Z" />
    <path d="M7 12.5L10.5 16L17 8" />
  </>,
);

export const DiceCube: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <path
      fill="none"
      stroke="#000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="32"
      d="M448,341.37V170.61A32,32,0,0,0,432.11,143l-152-88.46a47.94,47.94,0,0,0-48.24,0L79.89,143A32,32,0,0,0,64,170.61V341.37A32,32,0,0,0,79.89,369l152,88.46a48,48,0,0,0,48.24,0l152-88.46A32,32,0,0,0,448,341.37Z"
    />
    <polyline
      fill="none"
      stroke="#000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="32"
      points="69 153.99 256 263.99 443 153.99"
    />
    <line
      fill="none"
      stroke="#000"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="32"
      x1="256"
      y1="463.99"
      x2="256"
      y2="263.99"
    />
    <ellipse cx="256" cy="152" rx="24" ry="16" />
    <ellipse cx="208" cy="296" rx="16" ry="24" />
    <ellipse cx="112" cy="328" rx="16" ry="24" />
    <ellipse cx="304" cy="296" rx="16" ry="24" />
    <ellipse cx="400" cy="240" rx="16" ry="24" />
    <ellipse cx="304" cy="384" rx="16" ry="24" />
    <ellipse cx="400" cy="328" rx="16" ry="24" />
  </svg>
);

DiceCube.displayName = "DiceCube";

export const CheckedBoxBlue: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 50 50"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path stroke="#344054" d="M43.75 10.417L25 29.167l-8.333-8.334" />
      <path
        stroke="#306CFE"
        d="M43.75 22.917v18.75a2.083 2.083 0 0 1-2.083 2.083H8.333a2.083 2.083 0 0 1-2.083-2.083V8.333A2.083 2.083 0 0 1 8.333 6.25h25"
      />
    </g>
  </svg>
);

CheckedBoxBlue.displayName = "CheckedBoxBlue";

export const CheckedBoxLight: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 50 50"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4">
      <path stroke="#FFFFFF" d="M43.75 10.417L25 29.167l-8.333-8.334" />
      <path
        stroke="#FFE66D"
        d="M43.75 22.917v18.75a2.083 2.083 0 0 1-2.083 2.083H8.333a2.083 2.083 0 0 1-2.083-2.083V8.333A2.083 2.083 0 0 1 8.333 6.25h25"
      />
    </g>
  </svg>
);

CheckedBoxLight.displayName = "CheckedBoxLight";

export const LotteryStarburst: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <path d="M28.9788 17.0028L25.8711 17.2166C25.0368 17.2777 24.6927 18.2958 25.3288 18.8252L27.7169 20.78C28.2384 21.2076 29.0309 20.9836 29.2395 20.3524L29.9486 18.2246C30.1676 17.5933 29.6566 16.9519 28.9788 17.0028Z" fill="#212121" />
    <path d="M21.7494 2.69148L21.0294 5.59149C20.8294 6.37149 21.6894 7.00148 22.3694 6.57148L24.9094 4.99149C25.4594 4.65149 25.4894 3.85148 24.9594 3.47148L23.1794 2.18148C22.6494 1.79148 21.9094 2.06148 21.7494 2.69148Z" fill="#212121" />
    <path d="M6.43056 4.99468L8.96056 6.57468C9.64056 7.00468 10.5005 6.38468 10.3105 5.59468L9.59056 2.69467C9.43056 2.06467 8.69055 1.79468 8.16055 2.17468L6.38055 3.46468C5.85055 3.86468 5.88056 4.65468 6.43056 4.99468Z" fill="#212121" />
    <path d="M4.18524 20.7128L6.47524 18.7928C7.09524 18.2728 6.76524 17.2628 5.96524 17.2128L2.98524 17.0028C2.33524 16.9528 1.84524 17.5828 2.04524 18.2028L2.72524 20.2928C2.92524 20.9128 3.69524 21.1328 4.18524 20.7128Z" fill="#212121" />
    <path d="M17.7952 28.0047L16.6752 25.2347C16.3752 24.4847 15.3152 24.4847 15.0152 25.2347L13.8952 28.0047C13.6552 28.6047 14.0952 29.2647 14.7452 29.2647H16.9452C17.5952 29.2547 18.0352 28.6047 17.7952 28.0047Z" fill="#212121" />
    <path d="M17.5645 3.3242L19.2913 7.04387C19.617 7.73821 20.2584 8.22424 21.0083 8.33335L25.0639 8.95825C26.8993 9.23599 27.6393 11.4876 26.3565 12.8168L23.268 16.0008C22.7647 16.5166 22.5378 17.2506 22.6562 17.9648L23.3667 22.3391C23.6726 24.2238 21.6793 25.6323 20.0117 24.7098L16.6074 22.8153C15.9166 22.4284 15.0878 22.4284 14.397 22.8153L10.9927 24.7098C9.32509 25.6323 7.33183 24.2238 7.63773 22.3391L8.34819 17.9648C8.4666 17.2506 8.23965 16.5166 7.7364 16.0008L4.64785 12.8168C3.35519 11.4777 4.10513 9.23599 5.9405 8.95825L9.99608 8.33335C10.746 8.21432 11.3874 7.72829 11.713 7.04387L13.4399 3.3242C14.2589 1.5586 16.7455 1.5586 17.5645 3.3242Z" fill="#212121" />
  </svg>
);

LotteryStarburst.displayName = "LotteryStarburst";

export const AuctionStartPlay: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <path d="M23.5 16.866C24.1667 16.4811 24.1667 15.5189 23.5 15.134L11.5 8.20577C10.8333 7.82087 10 8.302 10 9.0718L10 22.9282C10 23.698 10.8333 24.1791 11.5 23.7942L23.5 16.866Z" fill="#212121" />
    <path d="M6 1C3.23858 1 1 3.23858 1 6V26C1 28.7614 3.23858 31 6 31H26C28.7614 31 31 28.7614 31 26V6C31 3.23858 28.7614 1 26 1H6ZM3 6C3 4.34315 4.34315 3 6 3H26C27.6569 3 29 4.34315 29 6V26C29 27.6569 27.6569 29 26 29H6C4.34315 29 3 27.6569 3 26V6Z" fill="#212121" />
  </svg>
);

AuctionStartPlay.displayName = "AuctionStartPlay";

export const SealedBidStart: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <path
      d="M 13.0625 4 C 12.1875 4 11.417969 4.449219 10.875 5.03125 C 10.332031 5.613281 9.941406 6.339844 9.59375 7.125 C 9.0625 8.335938 8.683594 9.679688 8.34375 10.9375 C 7.257813 11.253906 6.335938 11.648438 5.59375 12.125 C 4.726563 12.683594 4 13.457031 4 14.5 C 4 15.40625 4.554688 16.132813 5.25 16.65625 C 5.84375 17.101563 6.574219 17.472656 7.4375 17.78125 C 7.488281 18.011719 7.5625 18.246094 7.65625 18.46875 C 6.8125 18.945313 5.476563 19.867188 4.1875 21.625 L 3.59375 22.46875 L 4.4375 23.0625 L 7.71875 25.3125 L 6.375 28 L 25.625 28 L 24.28125 25.3125 L 27.5625 23.0625 L 28.40625 22.46875 L 27.8125 21.625 C 26.523438 19.867188 25.1875 18.945313 24.34375 18.46875 C 24.4375 18.246094 24.511719 18.011719 24.5625 17.78125 C 25.425781 17.472656 26.15625 17.101563 26.75 16.65625 C 27.445313 16.132813 28 15.40625 28 14.5 C 28 13.457031 27.273438 12.683594 26.40625 12.125 C 25.664063 11.648438 24.742188 11.253906 23.65625 10.9375 C 23.28125 9.632813 22.867188 8.265625 22.34375 7.0625 C 22.003906 6.285156 21.628906 5.570313 21.09375 5 C 20.558594 4.429688 19.796875 4 18.9375 4 C 18.355469 4 17.914063 4.160156 17.4375 4.28125 C 16.960938 4.402344 16.480469 4.5 16 4.5 C 15.039063 4.5 14.234375 4 13.0625 4 Z M 13.0625 6 C 13.269531 6 14.5 6.5 16 6.5 C 16.75 6.5 17.417969 6.347656 17.9375 6.21875 C 18.457031 6.089844 18.851563 6 18.9375 6 C 19.167969 6 19.339844 6.074219 19.625 6.375 C 19.910156 6.675781 20.246094 7.21875 20.53125 7.875 C 21.074219 9.117188 21.488281 10.8125 21.9375 12.375 C 21.9375 12.371094 21.992188 12.328125 21.84375 12.40625 C 21.59375 12.542969 21.070313 12.71875 20.4375 12.8125 C 19.167969 13.003906 17.4375 13 16 13 C 14.570313 13 12.835938 12.980469 11.5625 12.78125 C 10.925781 12.683594 10.410156 12.511719 10.15625 12.375 C 10.078125 12.332031 10.050781 12.347656 10.03125 12.34375 C 10.03125 12.332031 10.03125 12.324219 10.03125 12.3125 C 10.035156 12.304688 10.027344 12.289063 10.03125 12.28125 C 10.042969 12.269531 10.050781 12.261719 10.0625 12.25 C 10.136719 12.117188 10.179688 11.964844 10.1875 11.8125 C 10.1875 11.800781 10.1875 11.792969 10.1875 11.78125 C 10.546875 10.453125 10.949219 9.046875 11.4375 7.9375 C 11.730469 7.269531 12.046875 6.726563 12.34375 6.40625 C 12.640625 6.085938 12.84375 6 13.0625 6 Z M 8.1875 13.09375 C 8.414063 13.5625 8.8125 13.9375 9.21875 14.15625 C 9.828125 14.480469 10.527344 14.632813 11.28125 14.75 C 12.789063 14.984375 14.554688 15 16 15 C 17.4375 15 19.207031 15.007813 20.71875 14.78125 C 21.476563 14.667969 22.167969 14.519531 22.78125 14.1875 C 23.191406 13.964844 23.589844 13.570313 23.8125 13.09375 C 24.429688 13.3125 24.949219 13.546875 25.3125 13.78125 C 25.894531 14.15625 26 14.433594 26 14.5 C 26 14.558594 25.949219 14.75 25.53125 15.0625 C 25.113281 15.375 24.394531 15.738281 23.46875 16.03125 C 21.617188 16.621094 18.953125 17 16 17 C 13.046875 17 10.382813 16.621094 8.53125 16.03125 C 7.605469 15.738281 6.886719 15.375 6.46875 15.0625 C 6.050781 14.75 6 14.558594 6 14.5 C 6 14.433594 6.078125 14.183594 6.65625 13.8125 C 7.019531 13.578125 7.554688 13.324219 8.1875 13.09375 Z M 10.78125 18.5625 C 11.109375 18.617188 11.433594 18.707031 11.78125 18.75 C 11.910156 19.628906 12.59375 20.402344 13.6875 20.46875 C 14.53125 20.519531 15.480469 20.121094 15.5625 19 C 15.710938 19 15.851563 19 16 19 C 16.148438 19 16.289063 19 16.4375 19 C 16.519531 20.121094 17.46875 20.519531 18.3125 20.46875 C 19.40625 20.402344 20.089844 19.628906 20.21875 18.75 C 20.566406 18.707031 20.890625 18.617188 21.21875 18.5625 L 21.125 19.1875 C 20.816406 20.832031 20.082031 22.355469 19.15625 23.40625 C 18.230469 24.457031 17.144531 25.015625 16 25 C 14.824219 24.984375 13.761719 24.417969 12.84375 23.375 C 11.925781 22.332031 11.203125 20.839844 10.875 19.1875 Z M 23 20 C 23.371094 20.21875 24.347656 20.859375 25.46875 22.09375 L 22.4375 24.1875 L 21.71875 24.65625 L 22.09375 25.4375 L 22.375 26 L 19.21875 26 C 19.742188 25.648438 20.226563 25.207031 20.65625 24.71875 C 21.757813 23.46875 22.496094 21.832031 22.90625 20.0625 C 22.941406 20.042969 22.96875 20.019531 23 20 Z M 8.96875 20.03125 C 9.007813 20.054688 9.054688 20.070313 9.09375 20.09375 C 9.523438 21.839844 10.257813 23.457031 11.34375 24.6875 C 11.792969 25.199219 12.316406 25.636719 12.875 26 L 9.625 26 L 9.90625 25.4375 L 10.28125 24.65625 L 9.5625 24.1875 L 6.53125 22.09375 C 7.589844 20.925781 8.554688 20.28125 8.96875 20.03125 Z"
      fill="#212121"
    />
  </svg>
);

SealedBidStart.displayName = "SealedBidStart";

export const SealedBidReveal: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 21 21"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <g
      fill="none"
      fillRule="evenodd"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(0 1)"
    >
      <path d="m3.5 6.5 7-4 5.9922779 3.42415879c.62315.35608571 1.0077221 1.01877259 1.0077221 1.73648628v4.67870983c0 .7177137-.3845721 1.3804006-1.0077221 1.7364863l-5 2.8571429c-.6148654.3513516-1.3696904.3513516-1.98455578 0l-5-2.8571429c-.62314999-.3560857-1.00772212-1.0187726-1.00772212-1.7364863 0-1.2454967 0-2.1796192 0-2.8023676" />
      <path d="m9.55180035 9.98943096c.59195265.31874374 1.30444665.31874374 1.89639925 0l5.5518004-2.98943096" />
      <path d="m10.5 10.5v6.5" />
      <path d="m3.5 6.5 7 4-3 1-7-4z" />
      <path d="m10.5 2.5 7 4 2-2-7-4z" />
    </g>
  </svg>
);

SealedBidReveal.displayName = "SealedBidReveal";

export const AwardPersonCheck: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <path
      d="M12.0004 6.5C13.243 6.5 14.2504 5.49264 14.2504 4.25C14.2504 3.00736 13.243 2 12.0004 2C10.7577 2 9.75037 3.00736 9.75037 4.25C9.75037 5.49264 10.7577 6.5 12.0004 6.5ZM6.15015 4.17803C5.00701 3.69279 3.68228 4.22239 3.1887 5.36195C2.69342 6.50545 3.22266 7.82927 4.36975 8.31618L7.39345 9.59966C7.76283 9.75645 8.00271 10.1189 8.00271 10.5202V13.5597L6.12373 19.0167C5.71917 20.1916 6.34368 21.4721 7.51862 21.8766C8.69356 22.2812 9.974 21.6567 10.3786 20.4817L10.5238 20.0598C10.1869 19.2743 10.0004 18.4089 10.0004 17.5C10.0004 14.0776 12.6454 11.273 16.0027 11.0188V10.5181C16.0027 10.1168 16.2426 9.75438 16.612 9.59759L19.6308 8.31618C20.7779 7.82927 21.3071 6.50545 20.8118 5.36195C20.3183 4.22239 18.9935 3.69279 17.8504 4.17803L16.2444 4.85973C15.9037 5.00435 15.666 5.28256 15.5496 5.59067C15.0076 7.02499 13.6219 8.04295 12.0003 8.04295C10.3788 8.04295 8.99308 7.025 8.45103 5.5907C8.3346 5.2826 8.09695 5.00439 7.75625 4.85978L6.15015 4.17803ZM22.0004 17.5C22.0004 20.5376 19.5379 23 16.5004 23C13.4628 23 11.0004 20.5376 11.0004 17.5C11.0004 14.4624 13.4628 12 16.5004 12C19.5379 12 22.0004 14.4624 22.0004 17.5ZM19.8539 15.1464C19.6587 14.9512 19.3421 14.9512 19.1468 15.1464L15.5004 18.7929L13.8539 17.1464C13.6587 16.9512 13.3421 16.9512 13.1468 17.1464C12.9516 17.3417 12.9516 17.6583 13.1468 17.8536L15.1468 19.8536C15.3421 20.0488 15.6587 20.0488 15.8539 19.8536L19.8539 15.8536C20.0492 15.6583 20.0492 15.3417 19.8539 15.1464Z"
      fill="#212121"
    />
  </svg>
);

AwardPersonCheck.displayName = "AwardPersonCheck";

export const BidMoneyIncrease: CyberIcon = ({
  size = 24,
  className,
  ...props
}: CyberIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden={props["aria-hidden"]}
    {...props}
  >
    <g>
      <path d="m30.48 21.34 -1.52 0 0 1.52 1.52 0 0 1.52 1.52 0 0 -4.57 -1.52 0 0 1.53z" fill="#000000" strokeWidth="1" />
      <path d="M28.96 24.38h1.52v1.53h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="M28.96 18.29h1.52v1.52h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="M22.86 22.86h6.1v1.52h-6.1Z" fill="#000000" strokeWidth="1" />
      <path d="M22.86 16.76h6.1v1.53h-6.1Z" fill="#000000" strokeWidth="1" />
      <path d="M22.86 25.91h6.1v1.52h-6.1Z" fill="#000000" strokeWidth="1" />
      <path d="M21.34 18.29h1.52v1.52h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="m19.81 22.86 -1.52 0 0 1.52 1.52 0 0 1.53 -1.52 0 0 1.52 1.52 0 0 1.52 1.53 0 0 -7.61 -1.53 0 0 1.52z" fill="#000000" strokeWidth="1" />
      <path d="M18.29 28.95h1.52v1.53h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="M18.29 19.81h1.52v1.53h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="M10.67 30.48h7.62V32h-7.62Z" fill="#000000" strokeWidth="1" />
      <path d="M10.67 27.43h7.62v1.52h-7.62Z" fill="#000000" strokeWidth="1" />
      <path d="M10.67 24.38h7.62v1.53h-7.62Z" fill="#000000" strokeWidth="1" />
      <path d="M10.67 18.29h7.62v1.52h-7.62Z" fill="#000000" strokeWidth="1" />
      <path d="m10.67 15.24 0 1.52 3.05 0 0 -3.04 -1.53 0 0 1.52 -1.52 0z" fill="#000000" strokeWidth="1" />
      <path d="M10.67 12.19h1.52v1.53h-1.52Z" fill="#000000" strokeWidth="1" />
      <path d="M9.15 28.95h1.52v1.53H9.15Z" fill="#000000" strokeWidth="1" />
      <path d="m10.67 27.43 0 -1.52 -1.52 0 0 -1.53 1.52 0 0 -1.52 -1.52 0 0 -1.52 -1.53 0 0 7.61 1.53 0 0 -1.52 1.52 0z" fill="#000000" strokeWidth="1" />
      <path d="M9.15 19.81h1.52v1.53H9.15Z" fill="#000000" strokeWidth="1" />
      <path d="M3.05 16.76h7.62v1.53H3.05Z" fill="#000000" strokeWidth="1" />
      <path d="m28.96 9.14 0 -9.14 -9.15 0 0 1.53 1.53 0 0 1.52 1.52 0 0 1.52 -1.52 0 0 1.53 -3.05 0 0 -1.53 -1.52 0 0 -1.52 -1.53 0 0 -1.52 -3.05 0 0 1.52 -1.52 0 0 1.52 -1.52 0 0 1.53 -1.53 0 0 1.52 -1.52 0 0 1.52 3.05 0 0 -1.52 1.52 0 0 -1.52 1.52 0 0 -1.53 3.05 0 0 1.53 1.53 0 0 1.52 1.52 0 0 1.52 3.05 0 0 -1.52 1.52 0 0 -1.52 3.05 0 0 1.52 1.52 0 0 1.52 1.53 0z" fill="#000000" strokeWidth="1" />
      <path d="M3.05 10.67h7.62v1.52H3.05Z" fill="#000000" strokeWidth="1" />
      <path d="M3.05 27.43H6.1v1.52H3.05Z" fill="#000000" strokeWidth="1" />
      <path d="M3.05 22.86H6.1v1.52H3.05Z" fill="#000000" strokeWidth="1" />
      <path d="M3.05 19.81H6.1v1.53H3.05Z" fill="#000000" strokeWidth="1" />
      <path d="M1.53 25.91h1.52v1.52H1.53Z" fill="#000000" strokeWidth="1" />
      <path d="M1.53 12.19h1.52v1.53H1.53Z" fill="#000000" strokeWidth="1" />
      <path d="m1.53 16.76 1.52 0 0 -1.52 -1.52 0 0 -1.52 -1.53 0 0 12.19 1.53 0 0 -3.05 1.52 0 0 -1.52 -1.52 0 0 -1.53 1.52 0 0 -1.52 -1.52 0 0 -1.53z" fill="#000000" strokeWidth="1" />
    </g>
  </svg>
);

BidMoneyIncrease.displayName = "BidMoneyIncrease";

export const X = defineIcon(
  <>
    <path d="M6 6L18 18" />
    <path d="M18 6L6 18" />
  </>,
);

export const AlertTriangle = defineIcon(
  <>
    <path d="M12 3L22 20H2L12 3Z" />
    <path d="M12 9V14" />
    <path d="M12 17H12.01" />
  </>,
);

export const Moon = defineIcon(
  <>
    <path d="M18 16.5C16.7 17.5 15 18 13.2 18C9.2 18 6 14.8 6 10.8C6 8.9 6.7 7.2 8 6C8.1 10.2 11.7 13.9 16 14C16.7 14 17.4 13.9 18 13.7V16.5Z" />
  </>,
);

export const Hourglass = defineIcon(
  <>
    <path d="M7 3H17" />
    <path d="M7 21H17" />
    <path d="M8 3V8L12 12L8 16V21" />
    <path d="M16 3V8L12 12L16 16V21" />
    <path d="M9 8H15" />
    <path d="M9 16H15" />
  </>,
);

export const Crown = defineIcon(
  <>
    <path d="M4 18H20" />
    <path d="M5 16L6 7L10 11L12 5L14 11L18 7L19 16H5Z" />
  </>,
);

export const MessageSquare = defineIcon(
  <>
    <path d="M4 5H20V16H9L5 20V16H4V5Z" />
    <path d="M8 9H16" />
    <path d="M8 12H14" />
  </>,
);

export const Settings = defineIcon(
  <>
    <path d="M12 8V3" />
    <path d="M12 21V16" />
    <path d="M8 12H3" />
    <path d="M21 12H16" />
    <path d="M5.5 5.5L8.5 8.5" />
    <path d="M15.5 15.5L18.5 18.5" />
    <path d="M18.5 5.5L15.5 8.5" />
    <path d="M8.5 15.5L5.5 18.5" />
    <path d="M9 9H15V15H9V9Z" />
  </>,
);

export const LogOut = defineIcon(
  <>
    <path d="M10 5H5V19H10" />
    <path d="M13 12H21" />
    <path d="M17 8L21 12L17 16" />
  </>,
);

export const HelpCircle = defineIcon(
  <>
    <path d="M12 21C17 21 21 17 21 12C21 7 17 3 12 3C7 3 3 7 3 12C3 17 7 21 12 21Z" />
    <path d="M9 9C9.5 7.7 10.5 7 12 7C13.8 7 15 8.1 15 9.7C15 12 12 12 12 15" />
    <path d="M12 18H12.01" />
  </>,
);

export const Link = defineIcon(
  <>
    <path d="M9 8H7C4.8 8 3 9.8 3 12C3 14.2 4.8 16 7 16H9" />
    <path d="M15 8H17C19.2 8 21 9.8 21 12C21 14.2 19.2 16 17 16H15" />
    <path d="M8 12H16" />
  </>,
);

export const Link2 = Link;

export const Timer = defineIcon(
  <>
    <path d="M9 3H15" />
    <path d="M12 3V6" />
    <path d="M12 21C16.4 21 20 17.4 20 13C20 8.6 16.4 5 12 5C7.6 5 4 8.6 4 13C4 17.4 7.6 21 12 21Z" />
    <path d="M12 9V13L15 15" />
  </>,
);

export const Clock3 = Timer;

export const Trophy = defineIcon(
  <>
    <path d="M8 4H16V10C16 13 14 15 12 15C10 15 8 13 8 10V4Z" />
    <path d="M8 6H4V8C4 10.2 5.8 12 8 12" />
    <path d="M16 6H20V8C20 10.2 18.2 12 16 12" />
    <path d="M12 15V19" />
    <path d="M8 21H16" />
    <path d="M9 19H15" />
  </>,
);

export const Plus = defineIcon(
  <>
    <path d="M12 5V19" />
    <path d="M5 12H19" />
  </>,
);

export const PlusSquare = defineIcon(
  <>
    <path d="M4 4H20V20H4V4Z" />
    <path d="M12 8V16" />
    <path d="M8 12H16" />
  </>,
);

export const Gavel = defineIcon(
  <>
    <path d="M5 20H14" />
    <path d="M12 18L20 10" />
    <path d="M14 5L19 10" />
    <path d="M8 11L13 16" />
    <path d="M9 4L20 15" />
  </>,
);

export const Medal = defineIcon(
  <>
    <path d="M8 3L12 9L16 3" />
    <path d="M12 21C15.3 21 18 18.3 18 15C18 11.7 15.3 9 12 9C8.7 9 6 11.7 6 15C6 18.3 8.7 21 12 21Z" />
    <path d="M12 12L13 14H15L13.5 15.5L14 18L12 16.7L10 18L10.5 15.5L9 14H11L12 12Z" />
  </>,
);

export const RefreshCw = defineIcon(
  <>
    <path d="M20 7V13H14" />
    <path d="M4 17V11H10" />
    <path d="M19 13C18.4 16.4 15.5 19 12 19C9.9 19 8 18.1 6.7 16.7L4 14" />
    <path d="M5 11C5.6 7.6 8.5 5 12 5C14.1 5 16 5.9 17.3 7.3L20 10" />
  </>,
);

export const RefreshCcw = RefreshCw;
export const RotateCcw = RefreshCw;

export const Users = defineIcon(
  <>
    <path d="M9 11C10.7 11 12 9.7 12 8C12 6.3 10.7 5 9 5C7.3 5 6 6.3 6 8C6 9.7 7.3 11 9 11Z" />
    <path d="M15.5 10C16.9 10 18 8.9 18 7.5C18 6.1 16.9 5 15.5 5" />
    <path d="M3 19C3.7 15.8 5.8 14 9 14C12.2 14 14.3 15.8 15 19H3Z" />
    <path d="M14.5 14.5C17.2 14.7 19 16.2 20 19" />
  </>,
);

export const Upload = defineIcon(
  <>
    <path d="M12 16V4" />
    <path d="M7 9L12 4L17 9" />
    <path d="M5 16V20H19V16" />
  </>,
);

export const ArrowRight = defineIcon(
  <>
    <path d="M4 12H20" />
    <path d="M14 6L20 12L14 18" />
  </>,
);

export const ExternalLink = ArrowRight;

export const CalendarDays = defineIcon(
  <>
    <path d="M4 5H20V21H4V5Z" />
    <path d="M8 3V7" />
    <path d="M16 3V7" />
    <path d="M4 10H20" />
    <path d="M8 14H8.01" />
    <path d="M12 14H12.01" />
    <path d="M16 14H16.01" />
    <path d="M8 18H8.01" />
    <path d="M12 18H12.01" />
  </>,
);

export const Flag = defineIcon(
  <>
    <path d="M6 21V4" />
    <path d="M6 4H18L16 9L18 14H6" />
  </>,
);

export const Trash2 = defineIcon(
  <>
    <path d="M4 7H20" />
    <path d="M9 7V4H15V7" />
    <path d="M7 7L8 21H16L17 7" />
    <path d="M10 11V17" />
    <path d="M14 11V17" />
  </>,
);

export const BarChart3 = defineIcon(
  <>
    <path d="M5 20V11" />
    <path d="M12 20V5" />
    <path d="M19 20V14" />
    <path d="M3 20H21" />
  </>,
);

export const Swords = defineIcon(
  <>
    <path d="M4 20L20 4" />
    <path d="M14 4H20V10" />
    <path d="M20 20L4 4" />
    <path d="M4 4H10" />
    <path d="M4 4V10" />
  </>,
);

export const Lock = defineIcon(
  <>
    <path d="M6 10H18V21H6V10Z" />
    <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
    <path d="M12 14V17" />
  </>,
);

export const LockOpen = defineIcon(
  <>
    <path d="M6 10H18V21H6V10Z" />
    <path d="M8 10V7C8 4.8 9.8 3 12 3C13.7 3 15.1 4 15.7 5.5" />
    <path d="M12 14V17" />
  </>,
);

export const Save = defineIcon(
  <>
    <path d="M5 4H17L20 7V20H4V4H5Z" />
    <path d="M8 4V10H16V4" />
    <path d="M8 20V15H16V20" />
  </>,
);

export const Shield = defineIcon(
  <>
    <path d="M12 3L20 6V11C20 16 16.8 19.5 12 21C7.2 19.5 4 16 4 11V6L12 3Z" />
  </>,
);

export const ChevronLeft = defineIcon(
  <>
    <path d="M15 6L9 12L15 18" />
  </>,
);

export const ChevronRight = defineIcon(
  <>
    <path d="M9 6L15 12L9 18" />
  </>,
);

export const Copy = defineIcon(
  <>
    <path d="M8 8H20V20H8V8Z" />
    <path d="M4 16V4H16" />
  </>,
);
