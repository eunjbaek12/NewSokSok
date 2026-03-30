import { View } from 'react-native';

// Dummy screen for the center tab button.
// This screen never renders — the tab button intercepts press and navigates to /add-word modal.
export default function AddActionPlaceholder() {
    return <View />;
}
