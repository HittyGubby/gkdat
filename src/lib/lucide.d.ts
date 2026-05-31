declare module 'lucide-svelte' {
	import type { SvelteComponent } from 'svelte';
	import type { SVGAttributes } from 'svelte/elements';

	interface IconProps extends SVGAttributes<SVGSVGElement> {
		size?: number | string;
		color?: string;
		strokeWidth?: number | string;
		class?: string;
	}

	export class Icon extends SvelteComponent<IconProps> {}

	export class Search extends Icon {}
	export class ChevronDown extends Icon {}
	export class ChevronRight extends Icon {}
	export class Check extends Icon {}
	export class X extends Icon {}
	export class RotateCcw extends Icon {}
	export class ZoomIn extends Icon {}
	export class ZoomOut extends Icon {}
	export class Maximize2 extends Icon {}
	export class BarChart3 extends Icon {}
	export class TrendingUp extends Icon {}
	export class Settings extends Icon {}
	export class PanelLeftClose extends Icon {}
	export class PanelLeftOpen extends Icon {}
}
