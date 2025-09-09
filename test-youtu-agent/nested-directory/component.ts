/**
 * TypeScript Test Component for YoutAgent Directory Scanning
 * This file tests nested directory file detection
 */

interface GameComponent {
  id: string;
  type: ComponentType;
  active: boolean;
  priority: number;
}

enum ComponentType {
  RENDER = 'render',
  PHYSICS = 'physics',
  AUDIO = 'audio',
  INPUT = 'input',
  NETWORK = 'network'
}

abstract class BaseComponent implements GameComponent {
  constructor(
    public id: string,
    public type: ComponentType,
    public priority: number = 0
  ) {}

  public active: boolean = true;

  abstract update(deltaTime: number): void;
  abstract render?(): void;

  public activate(): void {
    this.active = true;
  }

  public deactivate(): void {
    this.active = false;
  }
}

class RenderComponent extends BaseComponent {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  constructor(id: string, canvasElement: HTMLCanvasElement) {
    super(id, ComponentType.RENDER, 100);
    this.canvas = canvasElement;
    this.context = canvasElement.getContext('2d')!;
  }

  update(deltaTime: number): void {
    if (!this.active) return;
    
    // Clear canvas
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(): void {
    if (!this.active) return;
    
    // Render logic here
    this.context.fillStyle = '#00ff00';
    this.context.fillRect(10, 10, 50, 50);
  }
}

export { BaseComponent, RenderComponent, ComponentType, GameComponent };