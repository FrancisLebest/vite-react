import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import {
  Asset,
  CameraOptions,
  ImageLibraryOptions,
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import type {UploadFile} from '../api/types';

export interface PickedMedia extends UploadFile {
  kind: 'image' | 'video';
  width?: number;
  height?: number;
  durationSec?: number;
  fileSize?: number;
}

/** Contract limits (docs/API.md → POST /posts). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const VIDEO_MAX_SECONDS = 180;

/**
 * CAMERA is declared in AndroidManifest (needed by our video capture flow), so
 * Android requires it to be granted at runtime before ACTION_VIDEO_CAPTURE.
 */
async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera access',
      message: 'StudyHub needs the camera to record videos and take photos.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  if (res === PermissionsAndroid.RESULTS.GRANTED) {
    return true;
  }
  if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    Alert.alert(
      'Camera blocked',
      'Enable the camera permission in Settings to continue.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Open Settings', onPress: () => Linking.openSettings()},
      ],
    );
  }
  return false;
}

function guessName(a: Asset, kind: 'image' | 'video'): string {
  if (a.fileName) {
    return a.fileName;
  }
  const ext = kind === 'video' ? 'mp4' : 'jpg';
  return `${kind}-${Date.now()}.${ext}`;
}

function guessType(a: Asset, kind: 'image' | 'video'): string {
  if (a.type) {
    return a.type;
  }
  const name = (a.fileName ?? a.uri ?? '').toLowerCase();
  if (kind === 'video') {
    return name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  }
  return name.endsWith('.png') ? 'image/png' : 'image/jpeg';
}

function toPicked(
  res: ImagePickerResponse,
  kind: 'image' | 'video',
): PickedMedia | null {
  if (res.didCancel) {
    return null;
  }
  if (res.errorCode) {
    const msg =
      res.errorCode === 'camera_unavailable'
        ? 'No camera is available on this device.'
        : res.errorCode === 'permission'
        ? 'Permission denied. You can allow access in Settings.'
        : res.errorMessage || 'Could not open the media picker.';
    Alert.alert('Media', msg);
    return null;
  }
  const a = res.assets?.[0];
  if (!a?.uri) {
    return null;
  }
  const picked: PickedMedia = {
    kind,
    uri: a.uri,
    name: guessName(a, kind),
    type: guessType(a, kind),
    width: a.width,
    height: a.height,
    durationSec: a.duration,
    fileSize: a.fileSize,
  };
  const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (picked.fileSize && picked.fileSize > limit) {
    Alert.alert(
      'File too large',
      `The maximum size is ${Math.round(limit / 1024 / 1024)} MB.`,
    );
    return null;
  }
  return picked;
}

export async function pickVideo(): Promise<PickedMedia | null> {
  const opts: ImageLibraryOptions = {
    mediaType: 'video',
    selectionLimit: 1,
    videoQuality: 'high',
    formatAsMp4: true,
  };
  return toPicked(await launchImageLibrary(opts), 'video');
}

export async function recordVideo(): Promise<PickedMedia | null> {
  if (!(await ensureCameraPermission())) {
    return null;
  }
  const opts: CameraOptions = {
    mediaType: 'video',
    videoQuality: 'high',
    durationLimit: VIDEO_MAX_SECONDS,
    saveToPhotos: false,
    formatAsMp4: true,
  };
  return toPicked(await launchCamera(opts), 'video');
}

export async function pickImage(
  maxDimension = 1600,
): Promise<PickedMedia | null> {
  return toPicked(
    await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      maxWidth: maxDimension,
      maxHeight: maxDimension,
      quality: 0.8,
    }),
    'image',
  );
}

export async function takePhoto(
  maxDimension = 1600,
): Promise<PickedMedia | null> {
  if (!(await ensureCameraPermission())) {
    return null;
  }
  return toPicked(
    await launchCamera({
      mediaType: 'photo',
      maxWidth: maxDimension,
      maxHeight: maxDimension,
      quality: 0.8,
      saveToPhotos: false,
    }),
    'image',
  );
}
