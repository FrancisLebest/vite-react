import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon, Logo, PillButton} from '../../components/ui';
import type {RootScreenProps} from '../../navigation/types';
import {font, makeStyles, spacing, useTheme, weight, MAX_CONTENT_WIDTH} from '../../theme';

const POINTS = [
  {
    icon: 'play-circle-outline',
    text: 'Short study videos from students & professors',
  },
  {icon: 'people-outline', text: 'Join your university and topic communities'},
  {icon: 'chatbubbles-outline', text: 'Chat, ask questions, share notes'},
];

export default function WelcomeScreen({
  navigation,
}: RootScreenProps<'Welcome'>) {
  const styles = useStyles();
  const {colors} = useTheme();
  return (
    <LinearGradient
      colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
      style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <View style={styles.column}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Logo size={56} />
            </View>
            <Text style={styles.title}>StudyHub</Text>
            <Text style={styles.tagline}>Learn together. Share smarter.</Text>
          </View>
          <View>
            {POINTS.map(p => (
              <View key={p.icon} style={styles.point}>
                <Icon name={p.icon} size={22} color={colors.white} />
                <Text style={styles.pointText}>{p.text}</Text>
              </View>
            ))}
          </View>
          <View>
            <PillButton
              title="Create an account"
              variant="outline"
              onPress={() => navigation.navigate('Register')}
            />
            <PillButton
              title="I already have an account"
              variant="soft"
              style={styles.second}
              onPress={() => navigation.navigate('Login')}
            />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const useStyles = makeStyles(c => ({
  flex: {flex: 1},
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: spacing.xxl,
    justifyContent: 'space-between',
  },
  brand: {alignItems: 'center', marginTop: spacing.xxxl},
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: c.white,
    fontSize: font.title + 6,
    fontWeight: weight.bold,
    marginTop: spacing.lg,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.lg,
    marginTop: spacing.xs,
  },
  point: {flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg},
  pointText: {
    color: c.white,
    fontSize: font.md,
    marginLeft: spacing.md,
    flex: 1,
  },
  second: {marginTop: spacing.md},
}));
