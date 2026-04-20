import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useModelDownload } from '../hooks/useModelDownload';
import { useTheme } from '@/features/theme';

interface AiModelDownloadModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AiModelDownloadModal({ isVisible, onClose, onSuccess }: AiModelDownloadModalProps) {
  const { colors } = useTheme();
  const { downloadState, progress, errorMsg, startDownload, deleteModel } = useModelDownload();
  const [showCellularWarning, setShowCellularWarning] = useState(false);

  const handleDownloadPress = async () => {
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
    const { success } = await startDownload(true);
    if (success) {
      onSuccess();
      onClose();
    }
  };

  if (downloadState === 'downloading') {
    return (
      <Modal visible={isVisible} transparent={true} animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            <Text style={[styles.title, { color: colors.text }]}>AI 모델 다운로드 중...</Text>
            <ActivityIndicator size="large" color={colors.accentAction} style={{ marginVertical: 20 }} />

            <View style={[styles.progressBarBackground, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: colors.accentAction }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.text }]}>{progress}% / 100% (약 1.5GB)</Text>

            <Text style={[styles.infoText, { color: colors.textTertiary }]}>앱을 끄지 말고 기다려 주세요.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (showCellularWarning) {
    return (
      <Modal visible={isVisible} transparent={true} animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            <Text style={[styles.title, { color: colors.text }]}>데이터 요금 경고</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              현재 Wi-Fi가 아닌 셀룰러 데이터 환경입니다.{'\n'}
              약 1.5GB의 파일을 다운로드하므로 요금이 발생할 수 있습니다.
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => {
                setShowCellularWarning(false);
                onClose();
              }}>
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>다음에 하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.dangerButton, { backgroundColor: colors.error }]} onPress={handleForceCellularDownload}>
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>계속 다운로드</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={isVisible} transparent={true} animationType="slide">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
          <Text style={[styles.title, { color: colors.text }]}>오프라인 AI 엔진 안내</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            더 빠르고 안전한 예문 생성 및 단어 분석을 위해{'\n'}오프라인 AI 언어 모델 설치가 필요합니다.{'\n\n'}
            (크기: 약 1.5GB, Wi-Fi 환경 연결을 권장합니다.)
          </Text>

          {errorMsg && (
            <Text style={[styles.errorText, { color: colors.error }]}>오류: {errorMsg}</Text>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.cancelButton, { backgroundColor: colors.surfaceSecondary }]} onPress={onClose}>
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>나중에 취소</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accentAction }]} onPress={handleDownloadPress}>
              <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>다운로드 시작</Text>
            </TouchableOpacity>
          </View>

          {downloadState === 'installed' && (
            <TouchableOpacity style={{ marginTop: 20 }} onPress={deleteModel}>
              <Text style={{ color: colors.error, fontSize: 12 }}>테스트용: 설치된 캐시 삭제</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginVertical: 10,
  },
  progressBarFill: {
    height: '100%',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
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
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  dangerButton: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
});
