import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text, TextInput } from 'react-native';

import { ScreenTemplate } from '../screen-template';

jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: object) => createElement(View, { ...props, testID: 'keyboard-avoiding' }),
  };
});

function Screen() {
  return (
    <ScreenTemplate>
      <TextInput accessibilityLabel="Write a comment…" />
      <Text>Body</Text>
    </ScreenTemplate>
  );
}

describe('screen template', () => {
  it('keeps inputs above the keyboard and taps working while it is open', async () => {
    await renderRouter({ index: Screen });

    const avoiding = screen.getByTestId('keyboard-avoiding');
    expect(avoiding.props.behavior).toBe('padding');
    expect(avoiding.props.keyboardVerticalOffset).toBe(0);
    let scroll = screen.getByText('Body').parent;
    while (scroll && scroll.props.keyboardShouldPersistTaps === undefined) scroll = scroll.parent;
    expect(scroll?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('offsets the keyboard by the navigation header', async () => {
    await renderRouter({
      _layout: () => <Stack screenOptions={{ headerShown: true }} />,
      index: Screen,
    });

    expect(await screen.findByText('Body')).toBeTruthy();
    expect(screen.getByTestId('keyboard-avoiding').props.keyboardVerticalOffset).toBeGreaterThan(0);
  });
});
