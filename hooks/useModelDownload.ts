import { useState, useEffect, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';

// 테스트용 임시 URL (실제로는 HuggingFace나 자체 S3의 GGUF URL을 사용)
const MODEL_URL = 'https://huggingface.co/google/gemma-2b-it-GGUF/resolve/main/2b_it_v2.gguf';
const MODEL_FILENAME = 'gemma-2-2b-it-q4_k_m.gguf'; // 편의상 명칭

export type DownloadState = 'uninstalled' | 'downloading' | 'installed' | 'error';

export function useModelDownload() {
  const [downloadState, setDownloadState] = useState<DownloadState>('uninstalled');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const modelPath = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${MODEL_FILENAME}` : '';
  const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);

  // 초기 마운트 시 모델 존재 여부 확인
  useEffect(() => {
    const checkFile = async () => {
      if (!modelPath) return;
      try {
        const info = await FileSystem.getInfoAsync(modelPath);
        if (info.exists) {
          setDownloadState('installed');
        }
      } catch (err) {
        console.error('Error checking model file', err);
      }
    };
    checkFile();
  }, [modelPath]);

  const startDownload = useCallback(async (forceCellular = false) => {
    if (!modelPath) {
      setErrorMsg('디렉토리 주소를 가져올 수 없어요.');
      setDownloadState('error');
      return { success: false, isCellularPromptNeeded: false };
    }

    try {
      // 1. 네트워크 체크 (업계 표준 적용)
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        setErrorMsg('인터넷이 연결되어 있지 않습니다.');
        setDownloadState('error');
        return { success: false, isCellularPromptNeeded: false };
      }

      // 셀룰러 환경인데 경고를 무시(forceCellular)하고 온 게 아니라면 중단 후 모달을 띄우게 함
      if (networkState.type === Network.NetworkStateType.CELLULAR && !forceCellular) {
        return { success: false, isCellularPromptNeeded: true };
      }

      setDownloadState('downloading');
      setProgress(0);
      setErrorMsg(null);

      const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
        const p = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setProgress(Math.max(0, Math.min(100, Math.round(p * 100))));
      };

      downloadResumableRef.current = FileSystem.createDownloadResumable(
        MODEL_URL,
        modelPath,
        {},
        callback
      );

      const result = await downloadResumableRef.current.downloadAsync();
      
      if (result) {
        setDownloadState('installed');
        setProgress(100);
        return { success: true, isCellularPromptNeeded: false };
      } else {
        throw new Error('다운로드 결과를 받을 수 없습니다.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || '다운로드 중 오류가 발생했습니다.');
      setDownloadState('error');
      return { success: false, isCellularPromptNeeded: false };
    }
  }, [modelPath]);

  const pauseDownload = useCallback(async () => {
    if (downloadResumableRef.current && downloadState === 'downloading') {
      try {
        await downloadResumableRef.current.pauseAsync();
        // 실제 운영 시 멈춤 상태('paused') 관리 추가 가능
      } catch (e) {
        console.error(e);
      }
    }
  }, [downloadState]);

  const resumeDownload = useCallback(async () => {
    if (downloadResumableRef.current && downloadState === 'downloading') { // Or 'paused'
      try {
        await downloadResumableRef.current.resumeAsync();
      } catch (e) {
        console.error(e);
      }
    }
  }, [downloadState]);

  const deleteModel = useCallback(async () => {
    if (!modelPath) return;
    try {
      await FileSystem.deleteAsync(modelPath, { idempotent: true });
      setDownloadState('uninstalled');
      setProgress(0);
    } catch (err) {
      console.error(err);
    }
  }, [modelPath]);

  return {
    downloadState,
    progress,
    errorMsg,
    startDownload,
    pauseDownload,
    resumeDownload,
    deleteModel,
    isInstalled: downloadState === 'installed',
  };
}
