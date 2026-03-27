import React from 'react';
import { FlatList } from 'react-native';
import { NavigationHeader } from '@components/Header';
import { RoundedContainer, SafeAreaView } from '@components/containers';
import { ListItem } from '@components/Options';
import { formatData } from '@utils/formatters';
import { EmptyItem } from '@components/common/empty';
import { COLORS } from '@constants/theme';

const CreditManagementScreen = ({ navigation }) => {
  const options = [
    { title: 'All Applications', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('CreditApplicationsScreen') },
    { title: 'Credit Exceeded Dashboard', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('CreditExceededScreen') },
    { title: 'Risk History', image: require('@assets/images/Home/options/transaction_auditing.png'), onPress: () => navigation.navigate('CreditRiskHistoryScreen') },
  ];

  const renderItem = ({ item }) => {
    if (item.empty) {
      return <EmptyItem />;
    }
    return <ListItem title={item.title} image={item.image} onPress={item.onPress} />;
  };

  return (
    <SafeAreaView backgroundColor={COLORS.white}>
      <NavigationHeader
        title="Credit Management"
        color={COLORS.black}
        backgroundColor={COLORS.white}
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer backgroundColor={COLORS.primaryThemeColor}>
        <FlatList
          data={formatData(options, 2)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 15 }}
          renderItem={renderItem}
          numColumns={2}
          keyExtractor={(item, index) => index.toString()}
        />
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default CreditManagementScreen;
