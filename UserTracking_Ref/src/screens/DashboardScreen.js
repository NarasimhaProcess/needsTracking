import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  FlatList,
  TextInput,
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import { locationTracker } from '../services/locationTracker';
import { PieChart, BarChart } from 'react-native-chart-kit';
import Icon from 'react-native-vector-icons/FontAwesome';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AreaSearchBar from '../components/AreaSearchBar';
import LargeChartModal from '../components/LargeChartModal';
import CalculatorModal from '../components/CalculatorModal';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';


const getDayName = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = new Date();
  return days[d.getDay()];
};

const getCurrentTime = () => {
  const d = new Date();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  // Assuming DB time format is HH:MM:SS or HH:MM. Using HH:MM for comparison.
  return `${hours}:${minutes}`;
};

const formatNumberWithCommas = (number) => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export default function DashboardScreen({ user, userProfile }) {
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [groupAreas, setGroupAreas] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [selectedAreaName, setSelectedAreaName] = useState('');

  // Chart and List State
  const [chartData, setChartData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [barChartData, setBarChartData] = useState(null);
  const [customerList, setCustomerList] = useState([]);
  const [displayedCustomerList, setDisplayedCustomerList] = useState([]);
  const [customerListTitle, setCustomerListTitle] = useState('');
  const [paidTodayCustomers, setPaidTodayCustomers] = useState([]);
  const [notPaidTodayCustomers, setNotPaidTodayCustomers] = useState([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showLargeChartModal, setShowLargeChartModal] = useState(false);
  const [largeChartType, setLargeChartType] = useState('');
  const [largeChartData, setLargeChartData] = useState(null);
  const [largeChartTitle, setLargeChartTitle] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [totalPaidCash, setTotalPaidCash] = useState(0);
  const [totalPaidUPI, setTotalPaidUPI] = useState(0);
  const [totalNotPaid, setTotalNotPaid] = useState(0);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [areaCurrentBalance, setAreaCurrentBalance] = useState(0);
  const [totalAmountGivenPending, setTotalAmountGivenPending] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);

  const debounceTimeout = useRef(null);

  const customerListRef = useRef(customerList);

  useEffect(() => {
    customerListRef.current = customerList;
  }, [customerList]);

  const handleSearchChange = useCallback((text) => {
    setCustomerSearchQuery(text);
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      const filtered = customerListRef.current.filter(customer => 
        customer.name.toLowerCase().includes(text.toLowerCase()) ||
        customer.mobile.includes(text) ||
        (customer.book_no && customer.book_no.toLowerCase().includes(text.toLowerCase()))
      );
      setDisplayedCustomerList(filtered);
    }, 500); // 500ms debounce delay
  }, []);

  useEffect(() => {
    // Check tracking status on initial load
    setIsTracking(locationTracker.getTrackingStatus());
    if (userProfile) {
      setIsTracking(userProfile.location_status === 1);
    }
  }, [userProfile]);

  useEffect(() => {
    if (!user?.id) return;
    
    async function fetchAreas() {
      let areaList = [];
      let error = null;

      if (userProfile?.user_type === 'superadmin') {
        // Superadmin can view all areas
        const { data, error: fetchError } = await supabase
          .from('area_master')
          .select('id, area_name')
          .order('area_name', { ascending: true });
        areaList = data || [];
        error = fetchError;
      } else {
        // Regular users/admins view areas based on their groups
        const currentDayName = getDayName();
        const currentTime = getCurrentTime();

        const { data, error: fetchError } = await supabase
          .from('user_groups')
          .select('groups(group_areas(area_master(id, area_name, enable_day, day_of_week, start_time_filter, end_time_filter)))') // Select new columns
          .eq('user_id', user.id);

        if (data) {
          const areaIdSet = new Set();
          data.forEach(userGroup => {
            userGroup.groups?.group_areas?.forEach(groupArea => {
              const area = groupArea.area_master;
              if (area && !areaIdSet.has(area.id)) {
                // Apply client-side filtering for 'user' type if conditions are met
                if (userProfile?.user_type === 'user') {
                  const areaStartTime = area.start_time_filter ? area.start_time_filter.substring(0, 5) : ''; // Assuming HH:MM:SS or HH:MM
                  const areaEndTime = area.end_time_filter ? area.end_time_filter.substring(0, 5) : '';

                  if (
                    !area.enable_day || // If enable_day is false, always include
                    (area.enable_day && // If enable_day is true, check other conditions
                    area.day_of_week === currentDayName &&
                    (
                      (areaStartTime === '00:00' && areaEndTime === '00:00') || // Special case for 24 hours
                      (areaStartTime <= areaEndTime && currentTime >= areaStartTime && currentTime <= areaEndTime) || // Case 1: Does not cross midnight
                      (areaStartTime > areaEndTime && (currentTime >= areaStartTime || currentTime <= areaEndTime))   // Case 2: Crosses midnight
                    ))
                  ) {
                    areaIdSet.add(area.id);
                    areaList.push(area);
                  }
                } else {
                  // For other user types, add without time filtering
                  areaIdSet.add(area.id);
                  areaList.push(area);
                }
              }
            });
          });
        }
        error = fetchError;
      }

        

      if (error) {
        console.error("Error fetching areas:", error);
        return;
      }
      setGroupAreas(areaList);
    }

    fetchAreas();
  }, [user, userProfile]); // Added userProfile to dependency array

  useEffect(() => {
    if (groupAreas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(groupAreas[0].id);
      setSelectedAreaName(groupAreas[0].area_name);
    }
  }, [groupAreas]);

  useEffect(() => {
    if (groupAreas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(groupAreas[0].id);
      setSelectedAreaName(groupAreas[0].area_name);
    }
  }, [groupAreas]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Re-fetch payment data for the currently selected area
    if (selectedAreaId) {
      // Creating a temporary function to call the async data fetching logic
      const refetch = async () => {
        await fetchPaymentData(selectedAreaId);
        setRefreshing(false);
      };
      refetch();
    } else {
      setRefreshing(false);
    }
  }, [selectedAreaId]);

  const generateAndShareCsv = async () => {
    if (!selectedAreaId) {
      Alert.alert('No Area Selected', 'Please select an area to generate the CSV.');
      return;
    }

    // Fetch data directly using the RPC for CSV generation to ensure consistency
    const { data, error } = await supabase.rpc('get_customer_payment_status_for_csv', { p_area_id: selectedAreaId });

    if (error) {
      console.error('Error calling get_customer_payment_status_for_csv for CSV:', error);
      Alert.alert('Error', 'Failed to fetch data for CSV export.');
      return;
    }

    if (data.length === 0) {
      Alert.alert('No Data', 'No transaction data available for today to export.');
      return;
    }

    const header = ['Area Name', 'Card No.', 'Customer Name', 'Mobile', 'Email', 'Payment Status', 'Expected Repayment Amount', 'Start Date', 'End Date'].join(',');
    const rows = data.map(row => [
      `"${row.area_name || ''}"`, 
      `"${row.card_no || ''}"`, 
      `"${row.customer_name || ''}"`, 
      `"${row.mobile || ''}"`, 
      `"${row.email || ''}"`, 
      `"${row.payment_status || ''}"`, 
      `"${row.expected_repayment_amount || 0}"`, 
      `"${row.start_date || ''}"`, 
      `"${row.end_date || ''}"`, 
    ].join(','));

    const csvContent = [header, ...rows].join('\n');
        const fileName = `${selectedAreaName.replace(/[^a-zA-Z0-9]/g, '_ ')}_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    const fileUri = FileSystem.cacheDirectory + fileName;

    try {
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      console.log('CSV written to:', fileUri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          UTI: 'public.csv',
          subject: 'Today\'s Transaction Report',
          recipients: [],
        });
      } else {
        Alert.alert('Sharing not available', 'Sharing is not available on your device.');
      }
    } catch (error) {
      console.error('Error generating or sharing CSV:', error);
      Alert.alert('Error', 'Failed to generate or share CSV.');
    }
  };

  // This function will be passed to the useEffect hook
  const fetchPaymentData = async (areaId) => {
    if (!areaId || !user?.id) {
      setChartData([]);
      setBarChartData(null);
      setCustomerList([]);
      setCustomerListTitle('');
      setLoadingChart(false);
      return;
    }

    setLoadingChart(true);
    setBarChartData(null);
    setCustomerList([]);
    setCustomerListTitle('');

    // Fetch current_balance from area_master
    const { data: areaData, error: areaError } = await supabase
      .from('area_master')
      .select('current_balance')
      .eq('id', areaId)
      .single();

    if (areaError) {
      console.error('Error fetching area_master current_balance:', areaError);
      // Continue with other data even if areaData fails
    }

    const currentBalance = areaData?.current_balance || 0;
    setAreaCurrentBalance(currentBalance);
    console.log('Dashboard - currentBalance:', currentBalance);

    // Fetch sum of amount_given for pending customers in this area
    const { data: pendingCustomersData, error: pendingCustomersError } = await supabase
      .from('customers') // Assuming 'customers' table
      .select('amount_given')
      .eq('area_id', areaId)
      .in('status', ['pending', 'Pending']); // Assuming 'status' column and 'pending' value, checking for case sensitivity

    let totalAmountGivenPendingCalculated = 0;
    if (pendingCustomersData) {
      totalAmountGivenPendingCalculated = pendingCustomersData.reduce((sum, customer) => sum + (customer.amount_given || 0), 0);
    }
    setTotalAmountGivenPending(totalAmountGivenPendingCalculated);
    console.log('Dashboard - totalAmountGivenPendingCalculated:', totalAmountGivenPendingCalculated);

    if (pendingCustomersError) {
      console.error('Error fetching pending customers amount_given:', pendingCustomersError);
    }

    // Fetch sum of expenses for this area
    const { data: expensesData, error: expensesError } = await supabase
      .from('user_expenses') // Corrected table name
      .select('amount')
      .eq('area_id', areaId);

    let totalExpensesCalculated = 0;
    if (expensesData) {
      totalExpensesCalculated = expensesData.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    }
    setTotalExpenses(totalExpensesCalculated);
    console.log('Dashboard - totalExpensesCalculated:', totalExpensesCalculated);

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
    }

    const { data, error } = await supabase.rpc('get_customer_payment_status_for_csv', { p_area_id: areaId });

    if (error) {
      console.error('Error calling get_customer_payment_status_for_csv:', error);
      setLoadingChart(false);
      return;
    }

    const calculateCustomerDetails = (customer) => {
      const totalAmountToPay = (customer.expected_repayment_amount || 0) * (customer.days_to_complete || 0);
      const totalAmountReceived = parseFloat(customer["totalAmountReceived"]) || 0;

      const calculatedRepaymentPeriod = (customer.expected_repayment_amount && customer.expected_repayment_amount !== 0)
        ? ((totalAmountToPay - totalAmountReceived) / customer.expected_repayment_amount)
        : 0; // Handle division by zero

      const remainingPeriods = (customer.days_to_complete || 0) - calculatedRepaymentPeriod;

      return {
        ...customer,
        totalAmountToPay: totalAmountToPay.toFixed(2),
        repaymentPeriod: calculatedRepaymentPeriod.toFixed(2),
        completionPeriods: customer.days_to_complete || 0,
        remainingPeriods: remainingPeriods.toFixed(2),
        totalAmountReceived: totalAmountReceived.toFixed(2),
      };
    };

    const paidToday = data.filter(customer => customer.payment_status === 'Paid Today').map(c => ({
      id: `${c.card_no}-${c.customer_name}`,
      name: c.customer_name,
      mobile: c.mobile,
      book_no: c.card_no,
      expected_repayment_amount: c.expected_repayment_amount,
      start_date: c.start_date,
      end_date: c.end_date,
      transaction_date: c.transaction_date, // Assuming this field exists in the data
      days_to_complete: c.days_to_complete,
      totalAmountReceived: c["totalAmountReceived"]
    })).map(calculateCustomerDetails).sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    const notPaidToday = data.filter(customer => customer.payment_status === 'Not Paid Today').map(c => ({
      id: `${c.card_no}-${c.customer_name}`,
      name: c.customer_name,
      mobile: c.mobile,
      book_no: c.card_no,
      expected_repayment_amount: c.expected_repayment_amount,
      start_date: c.start_date,
      end_date: c.end_date,
      transaction_date: c.transaction_date, // Assuming this field exists in the data
      days_to_complete: c.days_to_complete,
      totalAmountReceived: c["totalAmountReceived"]
    })).map(calculateCustomerDetails).sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    // Fetch daily payment summary
    const today = new Date().toISOString().slice(0, 10); // Get current date in YYYY-MM-DD format
    const { data: paymentSummary, error: summaryError } = await supabase.rpc('get_daily_payment_summary', { p_area_id: areaId, p_date: today });

    if (summaryError) {
      console.error('Error calling get_daily_payment_summary:', summaryError);
      // Continue with other data even if summary fails
    }

    let cashTotal = 0;
    let upiTotal = 0;

    if (paymentSummary) {
      paymentSummary.forEach(item => {
        if (item.payment_mode && item.payment_mode.toLowerCase() === 'cash') {
          cashTotal += parseFloat(item.total_amount);
        } else if (item.payment_mode && item.payment_mode.toLowerCase() === 'upi') {
          upiTotal += parseFloat(item.total_amount);
        } else if (item.payment_mode && item.payment_mode.toLowerCase() === 'paid by cash') { // Added for robustness
          cashTotal += parseFloat(item.total_amount);
        } else if (item.payment_mode && item.payment_mode.toLowerCase() === 'paid by upi') { // Added for robustness
          upiTotal += parseFloat(item.total_amount);
        }
      });
    }

    setTotalPaidCash(cashTotal);
    setTotalPaidUPI(upiTotal);
    console.log('Dashboard - cashTotal:', cashTotal);
    console.log('Dashboard - upiTotal:', upiTotal);

    const notPaidAmount = notPaidToday.reduce((acc, customer) => acc + (customer.expected_repayment_amount || 0), 0);
    setTotalNotPaid(notPaidAmount);

    // Calculate Cash on Hand
    // Assumption: 'amount given agreed of pending customers' is approximated by totalNotPaid
    const calculatedCashOnHand = currentBalance + (cashTotal + upiTotal) - totalAmountGivenPendingCalculated - totalExpensesCalculated;
    setCashOnHand(calculatedCashOnHand);
    console.log('Dashboard - calculatedCashOnHand:', calculatedCashOnHand);

    setPaidTodayCustomers(paidToday);
    setNotPaidTodayCustomers(notPaidToday);

    setChartData([
      { name: 'Paid Today', population: paidToday.length, color: '#4CAF50', legendFontColor: '#7F7F7F', legendFontSize: 15 },
      { name: 'Not Paid Today', population: notPaidToday.length, color: '#F44336', legendFontColor: '#7F7F7F', legendFontSize: 15 },
    ]);

    // Set Paid Today customers as default displayed list and bar chart
    setCustomerListTitle('Customers Who Paid Today');
    setCustomerList(paidToday);
    setDisplayedCustomerList(paidToday);
    if (paidToday.length > 0) {
      setBarChartData({
        labels: paidToday.map(c => c.name.substring(0, 10)),
        datasets: [{ data: paidToday.map(c => c.expected_repayment_amount || 0) }],
      });
    } else {
      setBarChartData(null);
    }

    setLoadingChart(false);
  };

  useEffect(() => {
    fetchPaymentData(selectedAreaId);
  }, [selectedAreaId, user]);

  const handleCustomerPress = (customerId) => {
    setExpandedCustomerId(prevId => (prevId === customerId ? null : customerId));
  };

  const handlePieSliceClick = async (data) => {
    console.log('Pie slice clicked:', data);
    const { name } = data;
    let title = '';
    let customers = [];
    
    if (name === 'Paid Today') {
      title = 'Customers Who Paid Today';
      customers = paidTodayCustomers;
    } else {
      title = 'Customers Who Did Not Pay Today';
      customers = notPaidTodayCustomers;
    }
    
    setCustomerListTitle(title);
    setCustomerList(customers); // Store the full list with calculations
    setDisplayedCustomerList(customers); // Initially display the full list
    setCustomerSearchQuery(''); // Clear search query on new selection
    

    if (customers.length > 0) {
        const newBarChartData = {
            labels: customers.map(c => c.name.substring(0, 20)),
            datasets: [{ data: customers.map(c => c.expected_repayment_amount || 0) }],
        };
        console.log('Setting bar chart data:', newBarChartData);
        setBarChartData(newBarChartData);
    } else {
        console.log('No customers, clearing bar chart data');
        setBarChartData(null);
    }
  };

  

  const renderHeader = () => {
    const navigation = useNavigation();
    return (
      <View>
        <View style={styles.searchContainer}>
          <AreaSearchBar
            areas={groupAreas}
            onAreaSelect={(id, name) => {
              setSelectedAreaId(id);
              setSelectedAreaName(name);
            }}
            selectedAreaName={selectedAreaName}
          />
        </View>

        {selectedAreaId && (
          <>
            <View style={styles.card}>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>Customer Payment Status</Text>
                <TouchableOpacity onPress={generateAndShareCsv} style={styles.shareButton}>
                  <MaterialIcons name="share" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>
              {loadingChart ? (
                <ActivityIndicator size="large" color="#007AFF" />
              ) : (
                <PieChart
                  data={chartData}
                  width={Dimensions.get('window').width - 64}
                  height={220}
                  chartConfig={chartConfig}
                  accessor={"population"}
                  backgroundColor={"transparent"}
                  paddingLeft={"15"}
                  onDataPointClick={handlePieSliceClick}
                />
              )}
              {!loadingChart && (
                <View style={styles.legendContainer}>
                  <TouchableOpacity style={styles.legendItem} onPress={() => handlePieSliceClick({ name: 'Paid Today' }) }>
                    <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
                    <Text style={styles.legendText}>Paid Today ({paidTodayCustomers.length})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.legendItem} onPress={() => handlePieSliceClick({ name: 'Not Paid Today' }) }>
                    <View style={[styles.legendColor, { backgroundColor: '#F44336' }]} />
                    <Text style={styles.legendText}>Not Paid Today ({notPaidTodayCustomers.length})</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!loadingChart && (
                <View style={styles.totalsContainer}>
                  <Text style={styles.totalText}>Paid by Cash: ₹{formatNumberWithCommas(totalPaidCash.toFixed(2))}</Text>
                  <Text style={styles.totalText}>Paid by UPI: ₹{formatNumberWithCommas(totalPaidUPI.toFixed(2))}</Text>
                  <Text style={[styles.totalText, styles.paidTotalText]}>Total Paid: ₹{formatNumberWithCommas((totalPaidCash + totalPaidUPI).toFixed(2))}</Text>
                  <Text style={[styles.totalText, styles.notPaidTotalText]}>Not Paid (Today): ₹{formatNumberWithCommas(totalNotPaid.toFixed(2))}</Text>
                </View>
              )}
              {!loadingChart && (
                <View style={styles.totalsContainer}>
                  <Text style={styles.totalText}>Area Current Balance: ₹{formatNumberWithCommas(areaCurrentBalance.toFixed(2))}</Text>
                  <Text style={styles.totalText}>+ Total Paid Today: ₹{formatNumberWithCommas((totalPaidCash + totalPaidUPI).toFixed(2))}</Text>
                  <Text style={styles.totalText}>- Pending Customer(s): ₹{formatNumberWithCommas(totalAmountGivenPending.toFixed(2))}</Text>
                  <Text style={styles.totalText}>- Total Expenses: ₹{formatNumberWithCommas(totalExpenses.toFixed(2))}</Text>
                  <Text style={[styles.totalText, styles.cashOnHandText]}>Cash on Hand: {cashOnHand >= 0 ? '+' : ''}₹{formatNumberWithCommas(cashOnHand.toFixed(2))}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.viewLargerButton}
                onPress={() => {
                  setLargeChartType('pie');
                  setLargeChartData(chartData);
                  setLargeChartTitle('Customer Payment Status');
                  setShowLargeChartModal(true);
                }}
              >
                <Text style={styles.viewLargerButtonText}>View Larger</Text>
              </TouchableOpacity>
            </View>

            {barChartData && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{customerListTitle}</Text>
                <ScrollView horizontal={true}>
                  <BarChart
                    data={barChartData}
                    width={Math.max(Dimensions.get('window').width - 64, barChartData.labels.length * 70)} // Increased multiplier
                    height={300}
                    yAxisLabel="₹"
                    chartConfig={chartConfig}
                    verticalLabelRotation={60}
                    fromZero={true}
                    showValuesOnTopOfBars={true}
                    renderValues={(value, index) => {                      const customer = displayedCustomerList[index];                      console.log('Dashboard BarChart - Customer:', customer);
                      return `₹${value.toFixed(0)}
${customer ? customer.book_no : ''}`;
                    }}
                    style={{ paddingRight: 30, paddingLeft: 10 }}
                  />
                </ScrollView>
                <TouchableOpacity
                  style={styles.viewLargerButton}
                  onPress={() => {
                    setLargeChartType('bar');
                    setLargeChartData(barChartData);
                    setLargeChartTitle(customerListTitle);
                    setShowLargeChartModal(true);
                  }}
                >
                  <Text style={styles.viewLargerButtonText}>View Larger</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        
      <TextInput
          style={[styles.customerSearchInput, { marginHorizontal: 16, marginBottom: 16 }]} // Apply margin here
          placeholder="Search customers by card no., name, or mobile."
          value={customerSearchQuery}
          onChangeText={handleSearchChange}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedCustomerList}
        ListHeaderComponent={() => (
          <>
            {renderHeader()}
            {selectedAreaId && displayedCustomerList.length > 0 && (
              <View style={styles.customerListHeaderContainer}>
                <Text style={[styles.customerListHeaderText, { flex: 1 }]}>Card No.</Text>
                <Text style={[styles.customerListHeaderText, { flex: 2.5 }]}>Name</Text>
                <Text style={[styles.customerListHeaderText, { flex: 2 }]}>Mobile</Text>
              </View>
            )}
          </>
        )}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.customerItemContainer}>
            <TouchableOpacity onPress={() => handleCustomerPress(item.id)}>
              <View style={styles.customerItem}>
                <Text style={[styles.customerBookNo, { flex: 1 }]}>{item.book_no}</Text>
                <Text style={[styles.customerName, { flex: 2.5 }]}>{item.name}</Text>
                <Text style={[styles.customerMobile, { flex: 2 }]}>{item.mobile} (₹{item.expected_repayment_amount})</Text>
              </View>
            </TouchableOpacity>
            {expandedCustomerId === item.id && (
              <View style={styles.customerDetailsContainer}>
                <Text style={styles.detailText}>Total Amount to Pay: ₹{item.totalAmountToPay}</Text>
                <Text style={styles.detailText}>Total Periods: {item.completionPeriods}</Text>
                <Text style={styles.detailText}>Repayment Amount: ₹{item.expected_repayment_amount}</Text>
                <Text style={[styles.detailText, styles.pendingText]}>Pending Repayment Period: {item.repaymentPeriod}</Text>
                <Text style={[styles.detailText, { color: 'green' }]}>Paid Repayment Period: {item.remainingPeriods}</Text>
                <Text style={[styles.detailText, { color: 'blue' }]}>Total Amount Received: ₹{item.totalAmountReceived}</Text>
                <Text style={styles.detailText}>Start Date: {item.start_date}</Text>
                <Text style={[styles.detailText, { color: 'blue' }]}>End Date: {item.end_date}</Text>
                <Text style={styles.detailText}>Transaction Date: {item.transaction_date}</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={() => (
            !selectedAreaId ? 
            <Text style={styles.emptyListText}>Please select an area to see customer details.</Text> :
            <Text style={styles.emptyListText}>No customers to display for the selected criteria.</Text>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="always" // Add this line
      />

      <Modal
        visible={showProfileModal}
        onRequestClose={() => setShowProfileModal(false)}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Image source={{ uri: userProfile?.profile_photo_data }} style={styles.modalImage} />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowProfileModal(false)}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LargeChartModal
        isVisible={showLargeChartModal}
        onClose={() => setShowLargeChartModal(false)}
        chartType={largeChartType}
        chartData={largeChartData}
        chartTitle={largeChartTitle}
        customerDataForModal={customerList}
      />

      
    </View>
  );
}

const chartConfig = {
  backgroundColor: '#e26a00',
  backgroundGradientFrom: '#fb8c00',
  backgroundGradientTo: '#ffa726',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  style: {
    borderRadius: 16,
  },
  propsForDots: {
    r: '6',
    strokeWidth: '2',
    stroke: '#ffa726',
  },
  propsForLabels: {
    fontSize: 10,
  },
  paddingLeft: 120, // Further increased padding for y-axis labels
  paddingRight: 20, // Added padding to the right
  formatYLabel: (yLabel) => {
    const value = parseFloat(yLabel);
    if (value >= 10000000) { // 1 Crore
      return `₹${(value / 10000000).toFixed(value % 10000000 === 0 ? 0 : 1)} Cr`;
    } else if (value >= 100000) { // 1 Lakh
      return `₹${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)} L`;
    } else if (value >= 1000) { // 1 Thousand
      return `₹${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} K`;
    } else {
      return `₹${value.toFixed(0)}`;
    }
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  calculatorButton: {
    padding: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
  },
  customerSearchInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  cardTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shareButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
  },
  modalImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 10,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  customerItemContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    paddingHorizontal: 20,
  },
  customerItem: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  customerListHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginTop: 10,
  },
  customerListHeaderText: {
    fontWeight: 'bold',
    color: '#1C1C1E',
    fontSize: 14,
  },
  customerName: {
    fontSize: 16,
    color: '#1C1C1E',
    textAlign: 'left',
  },
  customerMobile: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'left',
  },
  customerBookNo: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'left',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  emptyListText: {
      textAlign: 'center',
      marginTop: 20,
      fontSize: 16,
      color: '#8E8E93',
  },
  viewLargerButton: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignSelf: 'center',
  },
  viewLargerButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  customerDetailsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  detailText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  pendingText: {
    color: 'red',
  },
  paidText: {
    color: 'green',
  },
  highlightedText: {
    color: 'blue',
  },
  cardNoText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  totalsContainer: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  totalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  paidTotalText: {
    color: 'green',
  },
  notPaidTotalText: {
    color: 'red',
  },
  cashOnHandText: {
    color: '#007AFF', // A distinct color for Cash on Hand
    fontWeight: 'bold',
  },
});