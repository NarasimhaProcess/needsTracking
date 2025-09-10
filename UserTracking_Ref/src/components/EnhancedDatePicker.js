import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, Dimensions, Alert, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const EnhancedDatePicker = ({ 
  visible, 
  onClose, 
  onDateSelect, 
  startDate, 
  endDate, 
  repaymentFrequency, 
  daysToComplete,
  selectionMode = 'range' // 'range' or 'single'
}) => {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);
  const [selectedStartDate, setSelectedStartDate] = useState(null);
  const [calculatedEndDate, setCalculatedEndDate] = useState(null);
  const [highlightedDates, setHighlightedDates] = useState([]);
  const [months, setMonths] = useState([]);
  const flatListRef = useRef(null);
  const [initialScrollIndex, setInitialScrollIndex] = useState(0);

  // Helper function to parse dates safely without timezone issues
  const parseDate = useCallback((dateString) => {
    if (!dateString) return null;
    // If it's already a Date object, return it
    if (dateString instanceof Date) return dateString;
    // Parse YYYY-MM-DD format manually to avoid timezone issues
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed
    }
    // Fallback to standard Date parsing
    return new Date(dateString);
  }, []);

  // Generate months for virtual scrolling - memoized to prevent recreation
  const generateMonths = useCallback(() => {
    const monthsList = [];
    const currentYear = today.getFullYear();
    const startYear = currentYear - 2; // 2 years back
    const endYear = currentYear + 3; // 3 years forward
    
    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        const monthDate = new Date(year, month, 1);
        monthsList.push({
          id: `${year}-${month}`,
          date: monthDate,
          year,
          month
        });
      }
    }
    return monthsList;
  }, [today.getFullYear()]); // Only depend on year, not the entire today object

  // Initialize months only once when component mounts
  useEffect(() => {
    const monthsList = generateMonths();
    setMonths(monthsList);
    
    // Find initial scroll index based on current month or start date
    const targetDate = parseDate(startDate) || today;
    const targetIndex = monthsList.findIndex(m => 
      m.year === targetDate.getFullYear() && m.month === targetDate.getMonth()
    );
    setInitialScrollIndex(Math.max(0, targetIndex));
  }, [generateMonths]); // Remove startDate and today from dependencies

  // Memoized calculation functions to prevent recreation on every render
  const calculateHighlightedDates = useCallback((start, end) => {
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || !daysToComplete) {
      return [];
    }

    const dates = [];
    const periodsNum = parseInt(daysToComplete);
    const normalizedStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    // Always add the start date as a highlighted date
    dates.push(new Date(normalizedStart));

    for (let i = 1; i < periodsNum; i++) {
      let nextDate = new Date(normalizedStart);
      switch (repaymentFrequency) {
        case 'daily':
          nextDate.setDate(normalizedStart.getDate() + i);
          break;
        case 'weekly':
          nextDate.setDate(normalizedStart.getDate() + (i * 7));
          break;
        case 'monthly':
          nextDate.setMonth(normalizedStart.getMonth() + i);
          break;
        case 'yearly':
          nextDate.setFullYear(normalizedStart.getFullYear() + i);
          break;
      }
      if (nextDate <= end) {
        dates.push(new Date(nextDate));
      } else {
        break;
      }
    }
    return dates;
  }, [repaymentFrequency, daysToComplete]);

  const calculateEndDateAndHighlights = useCallback(() => {
    if (!selectedStartDate || !repaymentFrequency || !daysToComplete) {
      setCalculatedEndDate(null);
      setHighlightedDates([]);
      return;
    }

    const start = new Date(selectedStartDate);
    let endDate = new Date(start);
    
    // Calculate end date based on frequency and daysToComplete
    switch (repaymentFrequency) {
      case 'daily':
        endDate.setDate(start.getDate() + parseInt(daysToComplete));
        break;
      case 'weekly':
        endDate.setDate(start.getDate() + (parseInt(daysToComplete) * 7));
        break;
      case 'monthly':
        endDate.setMonth(start.getMonth() + parseInt(daysToComplete));
        break;
      case 'yearly':
        endDate.setFullYear(start.getFullYear() + parseInt(daysToComplete));
        break;
    }
    
    setCalculatedEndDate(endDate);
    const highlights = calculateHighlightedDates(start, endDate);
    setHighlightedDates(highlights);
  }, [selectedStartDate, repaymentFrequency, daysToComplete, calculateHighlightedDates]);

  // Reset internal state when modal opens to sync with current props
  useEffect(() => {
    if (!visible) return; // Early return if modal is not visible

    const propStart = parseDate(startDate);
    const propEnd = parseDate(endDate);

    if (selectionMode === 'single') {
      setSelectedStartDate(propStart || today);
      setCurrentMonth(propStart || today);

      if (propStart && propEnd && repaymentFrequency && daysToComplete) {
        const highlights = calculateHighlightedDates(propStart, propEnd);
        setHighlightedDates(highlights);
      } else {
        setHighlightedDates([]);
      }
    } else { // Range selection mode
      setSelectedStartDate(propStart);
      setCalculatedEndDate(propEnd);
      setCurrentMonth(propStart || today);

      if (propStart && propEnd && repaymentFrequency && daysToComplete) {
        const highlights = calculateHighlightedDates(propStart, propEnd);
        setHighlightedDates(highlights);
      } else {
        setHighlightedDates([]);
      }
    }
  }, [visible, startDate, endDate, selectionMode, repaymentFrequency, daysToComplete, parseDate, calculateHighlightedDates]);

  // Handle range mode calculations when selectedStartDate changes
  useEffect(() => {
    if (selectionMode === 'range' && selectedStartDate && repaymentFrequency && daysToComplete) {
      calculateEndDateAndHighlights();
    } else if (selectionMode === 'range' && !selectedStartDate) {
      setCalculatedEndDate(null);
      setHighlightedDates([]);
    }
  }, [selectionMode, calculateEndDateAndHighlights]); // Remove selectedStartDate from dependencies since it's in calculateEndDateAndHighlights

  const getDaysInMonth = useCallback((date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }, []);

  const getFirstDayOfMonth = useCallback((date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }, []);

  const isDateHighlighted = useCallback((date) => {
    return highlightedDates.some(highlightedDate => 
      highlightedDate.toDateString() === date.toDateString()
    );
  }, [highlightedDates]);

  const isDateSelected = useCallback((date) => {
    const dateStr = date.toDateString();
    return selectedStartDate && selectedStartDate.toDateString() === dateStr;
  }, [selectedStartDate]);

  const isDateEndDate = useCallback((date) => {
    const dateStr = date.toDateString();
    return calculatedEndDate && calculatedEndDate.toDateString() === dateStr && selectionMode === 'range';
  }, [calculatedEndDate, selectionMode]);

  const isDateInRange = useCallback((date) => {
    // Use internal state for range mode, props for single mode
    const rangeStart = selectionMode === 'range' ? selectedStartDate : (startDate ? parseDate(startDate) : null);
    const rangeEnd = selectionMode === 'range' ? calculatedEndDate : (endDate ? parseDate(endDate) : null);
    
    if (!rangeStart || !rangeEnd) return false;
    
    // Normalize dates for comparison
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const normalizedStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    const normalizedEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
    
    return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
  }, [selectionMode, selectedStartDate, calculatedEndDate, startDate, endDate, parseDate]);

  const handleDatePress = useCallback((date) => {
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const lastWeek = new Date(todayNormalized);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    if (date < lastWeek) {
      Alert.alert('Invalid Date', 'Cannot select a date more than a week ago.');
      return;
    }

    if (selectionMode === 'single') {
      const allowedStart = startDate ? parseDate(startDate) : null;
      const allowedEnd = endDate ? parseDate(endDate) : null;

      if (allowedStart && allowedEnd && (date < allowedStart || date > allowedEnd)) {
        Alert.alert('Invalid Date', 'Selected date is outside the allowed repayment range.');
        return;
      }
      setSelectedStartDate(date);
    } else { // Range selection mode
      setSelectedStartDate(date);
      // The useEffect will handle the calculation of end date and highlights
    }
  }, [selectionMode, startDate, endDate, parseDate, today]);

  // Render individual month for FlatList
  const renderMonth = useCallback(({ item: monthData }) => {
    const monthDate = monthData.date;
    const daysInMonth = getDaysInMonth(monthDate);
    const firstDay = getFirstDayOfMonth(monthDate);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const isHighlighted = isDateHighlighted(date);
      const isSelected = isDateSelected(date);
      const isInRange = isDateInRange(date);
      const isToday = date.toDateString() === today.toDateString();
      const isEndDate = isDateEndDate(date);

      days.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            isToday && styles.todayCircle,
            // Styles for range selection mode (customer repayment range picker)
            selectionMode === 'range' && isHighlighted && styles.highlightedDay,
            selectionMode === 'range' && isInRange && !isHighlighted && !isSelected && !isEndDate && styles.rangeDay,
            selectionMode === 'range' && (isSelected || isEndDate) && styles.selectedDay,
            // Styles for single selection mode (transaction date picker)
            selectionMode === 'single' && isInRange && !isHighlighted && !isSelected && styles.customerRepaymentPeriodDay,
            selectionMode === 'single' && isHighlighted && styles.highlightedDay,
            selectionMode === 'single' && isSelected && styles.selectedDay,
          ]}
          onPress={() => handleDatePress(date)}
        >
          <View style={styles.dayContent}>
            <Text style={[
              styles.dayText,
              isToday && !isHighlighted && !isSelected && !isEndDate && styles.todayText,
              selectionMode === 'range' && (isSelected || isEndDate) && styles.selectedDayText,
              selectionMode === 'range' && isHighlighted && styles.highlightedDayText,
              selectionMode === 'range' && isInRange && !isHighlighted && !isSelected && !isEndDate && styles.rangeDayText,
              selectionMode === 'single' && isSelected && styles.selectedDayText,
              selectionMode === 'single' && isHighlighted && styles.highlightedDayText,
              selectionMode === 'single' && isInRange && !isHighlighted && !isSelected && styles.customerRepaymentPeriodDayText,
            ]}>
              {day}
            </Text>
            {isSelected && selectionMode === 'single' && (
              <MaterialIcons name="check-circle" size={20} color="#333" style={styles.checkIcon} />
            )}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.monthContainer}>
        <Text style={styles.monthHeader}>
          {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.calendar}>
          {days}
        </View>
      </View>
    );
  }, [getDaysInMonth, getFirstDayOfMonth, isDateHighlighted, isDateSelected, isDateInRange, isDateEndDate, selectionMode, today, handleDatePress]);

  // Handle scroll to update current month display
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const visibleMonth = viewableItems[0].item.date;
      setCurrentMonth(visibleMonth);
    }
  }, []);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const navigateMonth = useCallback((direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  }, [currentMonth]);

  const handleConfirm = useCallback(() => {
    if (selectionMode === 'single') {
      if (selectedStartDate) {
        const year = selectedStartDate.getFullYear();
        const month = (selectedStartDate.getMonth() + 1).toString().padStart(2, '0');
        const day = selectedStartDate.getDate().toString().padStart(2, '0');
        console.log('Single mode - Selected date:', { original: selectedStartDate });
        selectedStartDate.setHours(0, 0, 0, 0);
        onDateSelect({ startDate: selectedStartDate });
      }
    } else { // Range selection mode
      if (selectedStartDate && calculatedEndDate) {
        // Format dates manually to avoid timezone issues
        const formatDateManually = (date) => {
          const year = date.getFullYear();
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        const formattedStartDate = formatDateManually(selectedStartDate);
        const formattedEndDate = formatDateManually(calculatedEndDate);
        
        console.log('Range mode - Selected dates:', {
          startOriginal: selectedStartDate,
          endOriginal: calculatedEndDate,
          startFormatted: formattedStartDate,
          endFormatted: formattedEndDate
        });
        
        onDateSelect({
          startDate: formattedStartDate,
          endDate: formattedEndDate
        });
      }
    }
    onClose();
  }, [selectionMode, selectedStartDate, calculatedEndDate, onDateSelect, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigateMonth(-1)}>
              <Text style={styles.navButton}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthYear}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => navigateMonth(1)}>
              <Text style={styles.navButton}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekDays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <Text key={day} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          <FlatList
            ref={flatListRef}
            data={months}
            renderItem={renderMonth}
            keyExtractor={(item) => item.id}
            initialScrollIndex={initialScrollIndex}
            getItemLayout={(data, index) => (
              { length: 320, offset: 320 * index, index }
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            showsVerticalScrollIndicator={false}
            style={styles.calendarContainer}
            maxToRenderPerBatch={2}
            windowSize={5}
            initialNumToRender={1}
            removeClippedSubviews={true}
          />

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, selectionMode === 'single' ? styles.rangeDay : styles.selectedDay]} />
              <Text style={styles.legendText}>Selected Date</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.highlightedDay]} />
              <Text style={styles.legendText}>Repayment Dates</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, styles.customerRepaymentPeriodDay]} />
              <Text style={styles.legendText}>Repayment Period</Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, (selectionMode === 'single' ? !selectedStartDate : (!selectedStartDate || !calculatedEndDate)) && styles.disabledButton]} 
              onPress={handleConfirm}
              disabled={selectionMode === 'single' ? !selectedStartDate : (!selectedStartDate || !calculatedEndDate)}
            >
              <Text style={styles.confirmButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: width * 0.9,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    paddingHorizontal: 15,
  },
  monthYear: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  weekDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekDayText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  calendarContainer: {
    maxHeight: 300,
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    flexBasis: '14.28%', // Approximately 100% / 7
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayContent: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  checkIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
  },
  dayText: {
    fontSize: 16,
  },
  selectedDay: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
  },
  selectedDayText: {
    color: 'white',
    fontWeight: 'bold',
  },
  highlightedDay: {
    backgroundColor: '#4CAF50',
    borderRadius: 20,
  },
  highlightedDayText: {
    color: 'white',
    fontWeight: 'bold',
  },
  rangeDay: {
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
  },
  rangeDayText: {
    color: '#333',
    fontWeight: 'bold',
  },
  customerRepaymentPeriodDay: {
    backgroundColor: 'transparent',
    borderColor: '#007AFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 20,
  },
  customerRepaymentPeriodDayText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    marginRight: 10,
  },
  cancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
  confirmButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginLeft: 10,
  },
  confirmButtonText: {
    textAlign: 'center',
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  todayCircle: {
    borderColor: '#007AFF',
    borderWidth: 1,
    borderRadius: 20,
  },
  todayText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  monthContainer: {
    paddingVertical: 20,
    paddingHorizontal: 10,
    minHeight: 320,
  },
  monthHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#333',
  },
});

export default EnhancedDatePicker;