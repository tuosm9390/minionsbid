// 모달 오버레이의 마우스 다운/업 닫힘 조건을 관리하는 훅
import { useRef, type MouseEventHandler } from "react";

export function useOverlayDismiss<TElement extends HTMLElement>(
  onDismiss: () => void,
) {
  const startedOnOverlayRef = useRef(false);

  const onMouseDown: MouseEventHandler<TElement> = (event) => {
    startedOnOverlayRef.current = event.target === event.currentTarget;
  };

  const onMouseUp: MouseEventHandler<TElement> = (event) => {
    const shouldDismiss =
      startedOnOverlayRef.current && event.target === event.currentTarget;
    startedOnOverlayRef.current = false;

    if (shouldDismiss) {
      onDismiss();
    }
  };

  return { onMouseDown, onMouseUp };
}
