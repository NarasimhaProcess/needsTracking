import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Tooltip } from 'react-native-elements';
import { MaterialIcons } from '@expo/vector-icons';

const CustomerItemActions = ({
  item,
  setIsEditMode,
  setSelectedCustomer,
  setName,
  setMobile,
  setEmail,
  setBookNo,
  setCustomerType,
  setAreaId,
  areas,
  setSelectedAreaName,
  setLatitude,
  setLongitude,
  setRemarks,
  setAmountGiven,
  setRepaymentFrequency,
  repaymentPlans,
  setPlanOptions,
  setRepaymentAmount,
  setDaysToComplete,
  setAdvanceAmount,
  setLateFee,
  setSelectedPlanId,
  setStartDate,
  setEndDate,
  calculateRepaymentDetails,
  fetchCustomerDocs,
  setShowCustomerFormModal,
  openTransactionModal,
  openLocationPicker,
  handleCloneCustomer,
  handleChangeStatus,
}) => {
  const [showActions, setShowActions] = useState(false);

  const renderStatusIcon = (status) => {
    let iconName;
    let color;

    switch (status) {
      case 'Active':
        iconName = 'check-circle';
        color = 'green';
        break;
      case 'Inactive':
        iconName = 'pause-circle-outline';
        color = 'orange';
        break;
      case 'Closed':
        iconName = 'lock';
        color = 'black';
        break;
      case 'Defaulted':
        iconName = 'warning';
        color = 'red';
        break;
      case 'Pending':
      default:
        iconName = 'hourglass-empty';
        color = 'gray';
        break;
    }

    return <MaterialIcons name={iconName} size={24} color={color} />;
  };

  return (
    <View style={styles.actionsContainer}>
      <Tooltip popover={<Text>{item.status}</Text>}>
        <View style={styles.iconButton}>
          {renderStatusIcon(item.status)}
        </View>
      </Tooltip>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => {
          setIsEditMode(true);
          setSelectedCustomer(item);
          setName(item.name || '');
          setMobile(item.mobile || '');
          setEmail(item.email || '');
          setBookNo(item.book_no || '');
          setCustomerType(item.customer_type || '');
          setAreaId(item.area_id || null);
          const selectedArea = areas.find(a => a.id === item.area_id);
          setSelectedAreaName(selectedArea ? selectedArea.area_name : '');
          setLatitude(item.latitude || null);
          setLongitude(item.longitude || null);
          setRemarks(item.remarks || '');
          setAmountGiven(item.amount_given ? String(item.amount_given) : '');
          setRepaymentFrequency(item.repayment_frequency || '');
          const filteredPlans = repaymentPlans.filter(p => p.frequency === (item.repayment_frequency || ''));
          setPlanOptions(filteredPlans);
          setRepaymentAmount(item.repayment_amount ? String(item.repayment_amount) : '');
          setDaysToComplete(item.days_to_complete ? String(item.days_to_complete) : '');
          setAdvanceAmount(item.advance_amount ? String(item.advance_amount) : '0');
          setLateFee(item.late_fee_per_day ? String(item.late_fee_per_day) : '');
          setSelectedPlanId(item.repayment_plan_id ? String(item.repayment_plan_id) : '');
          setStartDate(item.start_date ? item.start_date.split('T')[0] : '');
          setEndDate(item.end_date ? item.end_date.split('T')[0] : '');
          calculateRepaymentDetails(
            item.repayment_plan_id,
            item.amount_given ? String(item.amount_given) : '',
            item.repayment_frequency || ''
          );
          fetchCustomerDocs(item.id);
          setShowCustomerFormModal(true);
        }}
      >
        <MaterialIcons name="edit" size={24} color="#007AFF" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={() => openTransactionModal(item)}>
        <MaterialIcons name="receipt" size={24} color="#4CAF50" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={() => setShowActions(!showActions)}>
        <MaterialIcons name="more-vert" size={24} color="#666" />
      </TouchableOpacity>

      {showActions && (
        <View style={styles.actionsMenu}>
          <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActions(false); handleChangeStatus(item); }} disabled={item.status === 'Closed'}>
            <MaterialIcons name="swap-horiz" size={24} color="#FFC107" style={item.status === 'Closed' ? { opacity: 0.5 } : {}} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActions(false); openLocationPicker(item); }}>
            <MaterialIcons name="location-on" size={24} color="#FF5722" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionMenuItem} onPress={() => { setShowActions(false); handleCloneCustomer(item); }}>
            <MaterialIcons name="content-copy" size={24} color="#FFA500" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionMenuItem} onPress={() => setShowActions(false)}>
            <MaterialIcons name="close" size={24} color="#E53935" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  actionsContainer: {
    position: 'relative',
    flexDirection: 'row', // Make main icons horizontal
    alignItems: 'center', // Center vertically
  },
  actionsMenu: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 3,
    padding: 4,
    zIndex: 10,
    flexDirection: 'row', // Make dropdown icons horizontal
    flexWrap: 'wrap',
    minWidth: 180, // Restore width for horizontal icons
  },
  actionMenuItem: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2, // Restore margin for horizontal icons
  },
  iconButton: {
    padding: 4,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
});

export default CustomerItemActions;