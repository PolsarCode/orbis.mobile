import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Input } from '../input';

describe('input', () => {
  it('keeps the themed look when a caller adds its own style', async () => {
    await render(<Input accessibilityLabel="Folder name" style={{ flex: 1, borderColor: 'red' }} />);

    const style = StyleSheet.flatten(screen.getByLabelText('Folder name').props.style);
    expect(style).toMatchObject({
      flex: 1,
      borderColor: 'red',
      borderWidth: 1,
      minHeight: 44,
      fontSize: 16,
    });
    expect(style.color).toBeDefined();
    expect(style.backgroundColor).toBeDefined();
  });

  it('uses the themed style on its own', async () => {
    await render(<Input accessibilityLabel="Search" />);

    const style = StyleSheet.flatten(screen.getByLabelText('Search').props.style);
    expect(style).toMatchObject({ borderWidth: 1, minHeight: 44 });
    expect(style.borderColor).not.toBe('red');
  });
});
