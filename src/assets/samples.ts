import studioPortraitUrl from './images/sample_studio_portrait_1794675745437.jpg';
import productSneakerUrl from './images/sample_product_sneaker_1794675746444.jpg';
import vintageCameraUrl from './images/sample_vintage_camera_1794675747295.jpg';

export interface SampleAsset {
  id: string;
  label: string;
  filename: string;
  url: string;
  tag: string;
}

export const SAMPLE_IMAGE_ASSETS: SampleAsset[] = [
  {
    id: 'portrait',
    label: 'Studio Portrait',
    filename: 'studio_portrait.jpg',
    url: studioPortraitUrl,
    tag: 'Portrait',
  },
  {
    id: 'sneaker',
    label: 'Product Sneaker',
    filename: 'product_sneaker.jpg',
    url: productSneakerUrl,
    tag: 'Product',
  },
  {
    id: 'camera',
    label: 'Vintage Camera',
    filename: 'vintage_camera.jpg',
    url: vintageCameraUrl,
    tag: 'Hardware',
  },
];
