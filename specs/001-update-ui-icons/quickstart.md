# Quickstart: Using the New Icon System

새로운 픽셀 아이콘 시스템을 사용하여 일관된 Cyber-Pixel UI를 유지하는 방법입니다.

## 1. Import PixelIcon
기존 `Lucide` 아이콘을 직접 사용하는 대신, `PixelIcon` 컴포넌트로 래핑하여 사용합니다.

```tsx
import { PixelIcon } from '@/components/ui/PixelIcon';
import { Crown } from 'lucide-react';

export function LeadingBadge() {
  return (
    <PixelIcon 
      icon={Crown} 
      animation="success" 
      color="text-minion-yellow" 
      label="현재 선두" 
    />
  );
}
```

## 2. Replacing Emojis
텍스트로 하드코딩된 이모지를 `PixelIcon`으로 교체합니다.

**Before:**
```tsx
<div>✅ 연결됨</div>
```

**After:**
```tsx
<div className="flex items-center gap-2">
  <PixelIcon icon={CheckSquare} color="text-green-500" size={16} />
  연결됨
</div>
```

## 3. Dynamic Animations
상태 변화에 따라 애니메이션을 트리거합니다.

```tsx
<PixelIcon 
  icon={Timer} 
  animation={timeLeft <= 5 ? "urgent" : "idle"} 
/>
```

## 4. Best Practices
- **크기**: 가급적 8의 배수(16, 24, 32, 48)를 사용하여 픽셀 정렬을 유지하세요.
- **접근성**: 아이콘이 단독으로 의미를 가지는 경우 반드시 `label` 속성을 전달하세요.
- **색상**: `DESIGN.md`에 정의된 브랜드 컬러 토큰(`text-minion-*`)을 우선적으로 사용하세요.
