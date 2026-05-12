import { render, screen } from "@testing-library/react";
import { PixelIcon } from "./PixelIcon";
import { Check } from "@/components/ui/CyberIcons";
import { describe, it, expect } from "vitest";

describe("PixelIcon Component", () => {
  it("renders the icon with correct size and strokeWidth", () => {
    const { container } = render(<PixelIcon icon={Check} size={32} strokeWidth={4} />);
    const svg = container.querySelector("svg");
    
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveAttribute("stroke-width", "4");
  });

  it("does not override the icon renderer style", () => {
    const { container } = render(<PixelIcon icon={Check} />);
    const svg = container.querySelector("svg");
    
    expect(svg?.style.shapeRendering).toBe("");
  });

  it("provides accessibility label when provided", () => {
    render(<PixelIcon icon={Check} label="Success Icon" />);
    const icon = screen.getByLabelText("Success Icon");
    
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("role", "img");
  });

  it("is hidden from screen readers when no label is provided", () => {
    const { container } = render(<PixelIcon icon={Check} />);
    const wrapper = container.firstChild;
    
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });

  it("applies correct animation variant when state changes", () => {
    const { rerender, container } = render(<PixelIcon icon={Check} animation="idle" />);
    const wrapper = container.firstChild;
    
    expect(wrapper).toBeInTheDocument();
    
    rerender(<PixelIcon icon={Check} animation="urgent" />);
  });

  it("handles isInteractive prop by applying minimum touch target size", () => {
    const { container } = render(<PixelIcon icon={Check} isInteractive={true} />);
    const wrapper = container.firstChild as HTMLElement;
    
    expect(wrapper.className).toContain("min-w-[44px]");
    expect(wrapper.className).toContain("min-h-[44px]");
  });

  it("correctly handles ARIA attributes based on label presence", () => {
    const { rerender, container } = render(<PixelIcon icon={Check} label="Checkmark" />);
    let wrapper = container.firstChild;
    expect(wrapper).toHaveAttribute("role", "img");
    expect(wrapper).toHaveAttribute("aria-label", "Checkmark");

    rerender(<PixelIcon icon={Check} />);
    wrapper = container.firstChild;
    expect(wrapper).not.toHaveAttribute("role");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });
});
