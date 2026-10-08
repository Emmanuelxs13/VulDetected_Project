/**
 * `@vuldetected/ui` — the VulDetected design system.
 *
 * Source-export package: no build step. The consuming app transpiles the
 * TypeScript directly (Next.js does this for `transpilePackages`), so a
 * component change is visible on the next dev-server reload with no watch
 * pipeline and no stale `dist`.
 */

export { cn } from './lib/cn';

export {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  SEVERITY_ON_SURFACE,
  SURFACES,
  assertSeverityContrast,
  contrastRatio,
  describeContrast,
  relativeLuminance,
} from './lib/contrast';
export type { ContrastReportEntry, SeverityKey, ThemeName } from './lib/contrast';

export { Alert, alertVariants } from './components/Alert';
export type { AlertProps } from './components/Alert';

export { Badge, badgeVariants } from './components/Badge';
export type { BadgeProps } from './components/Badge';

export { Button, buttonVariants } from './components/Button';
export type { ButtonProps } from './components/Button';

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/Card';

export { Container } from './components/Container';
export type { ContainerProps } from './components/Container';

export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps } from './components/EmptyState';

export { Field } from './components/Field';
export type { FieldControlProps, FieldProps } from './components/Field';

export { Input, inputVariants } from './components/Input';
export type { InputProps } from './components/Input';

export { Label } from './components/Label';
export type { LabelProps } from './components/Label';

export { Progress, progressVariants } from './components/Progress';
export type { ProgressProps } from './components/Progress';

export { Skeleton, SkeletonRow } from './components/Skeleton';

export { Spinner } from './components/Spinner';
export type { SpinnerProps } from './components/Spinner';

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/Table';
export type { TableCellProps, TableHeadProps } from './components/Table';

export { Textarea, textareaVariants } from './components/Textarea';
export type { TextareaProps } from './components/Textarea';

export {
  CircleCheckIcon,
  DashedCircleQuestionIcon,
  DiamondIcon,
  InboxIcon,
  InfoIcon,
  MinusIcon,
  OctagonExclamationIcon,
  RoundedSquareInfoIcon,
  SeverityIcon,
  TriangleExclamationIcon,
  WarningIcon,
} from './components/icons';
export type { SeverityIconName } from './components/icons';
