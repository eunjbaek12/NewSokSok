import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useModelDownload } from '../hooks/useModelDownload';

interface AiModelDownloadModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AiModelDownloadModal({ isVisible, onClose, onSuccess }: AiModelDownloadModalProps) {
  const { downloadState, progress, errorMsg, startDownload, deleteModel } = useModelDownload();
  const [showCellularWarning, setShowCellularWarning] = useState(false);

  const handleDownloadPress = async () => {
    // startDownload에 false (세포 데이터 환경 무시 안함)를 전달
    const { success, isCellularPromptNeeded } = await startDownload(false);

    if (isCellularPromptNeeded) {
      setShowCellularWarning(true);
    } else if (success) {
      onSuccess();
      onClose();
    }
  };

  const handleForceCellularDownload = async () => {
    setShowCellularWarning(false);
    // 강제 다운로드(Data/Cellular 허용)
    const { success } = await startDownload(true);
    if (success) {
      onSuccess();
      onClose();
    }
  };

  // 다운로드 진행 중 UI (0~100%)
  if (downloadState === 'downloading') {
    return (
      <Modal visible={isVisible} transparent={true} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.title}>AI 모델 다운로드 중...</Text>
            <ActivityIndicator size="large" color="#0066FF" style={{ marginVertical: 20 }} />
            
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}% / 100% (약 1.5GB)</Text>
            
            <Text style={styles.infoText}>앱을 끄지 말고 기다려 주세요.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  // 셀룰러 경고 UI
  if (showCellularWarning) {
    return (
      <Modal visible={isVisible} transparent={true} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.title}>데이터 요금 경고</Text>
            <Text style={styles.description}>
              현재 Wi-Fi가 아닌 셀룰러 데이터 환경입니다.{'\n'}
              약 1.5GB의 파일을 다운로드하므로 요금이 발생할 수 있습니다.
            </Text>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => {
                setShowCellularWarning(false);
                onClose();
              }}>
                <Text style={styles.secondaryButtonText}>다음에 하기</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.dangerButton} onPress={handleForceCellularDownload}>
                <Text style={styles.primaryButtonText}>계속 다운로드</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // 기본 안내 UI (다운로드 전 또는 실패 시)
  return (
    <Modal visible={isVisible} transparent={true} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.title}>오프라인 AI 엔진 안내</Text>
          <Text style={styles.description}>
            더 빠르고 안전한 예문 생성 및 단어 분석을 위해{'\n'}오프라인 AI 언어 모델 설치가 필요합니다.{'\n\n'}
            (크기: 약 1.5GB, Wi-Fi 환경 연결을 권장합니다.)
          </Text>

          {errorMsg && (
            <Text style={styles.errorText}>오류: {errorMsg}</Text>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>나중에 취소</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={handleDownloadPress}>
              <Text style={styles.primaryButtonText}>다운로드 시작</Text>
            </TouchableOpacity>
          </View>

          {/* 테스트용 삭제 버튼 (개발 편의) */}
          {downloadState === 'installed' && (
            <TouchableOpacity style={{ marginTop: 20 }} onPress={deleteModel}>
              <Text style={{ color: 'red', fontSize: 12 }}>테스트용: 설치된 캐시 삭제</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#999',
    marginTop: 12,
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 10,
    backgroundColor: '#EEEEEE',
    borderRadius: 5,
    overflow: 'hidden',
    marginVertical: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0066FF',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#0066FF',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 15,
  },
  dangerButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
  },
});
