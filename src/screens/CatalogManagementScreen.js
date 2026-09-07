import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  Switch,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import {
  supabase,
  getCategories,
  getSubcategories,
  getAllCategoriesWithSubcategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  seedMasterCatalogData,
} from '../services/supabase';
import { showAlert, showConfirm } from '../utils/alertUtils';
import StoreNavigationFooter from '../components/StoreNavigationFooter';

const POPULAR_ICONS = [
  'shopping-basket',
  'lemon-o',
  'birthday-cake',
  'coffee',
  'tag',
  'laptop',
  'heart',
  'home',
  'medkit',
  'cube',
  'cutlery',
  'car',
  'book',
  'gift',
  'camera',
  'star',
];

const CatalogManagementScreen = ({ navigation, route }) => {
  const fromTab = route?.params?.fromTab;
  const activeFooterTab = fromTab || 'store';
  const routeSellerId = route?.params?.sellerId;
  const routeSellerName = route?.params?.sellerName;
  const routeCustomerId = route?.params?.customerId;

  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'subcategories'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Category Modal State
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catIcon, setCatIcon] = useState('cube');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState('0');
  const [catActive, setCatActive] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);

  // Subcategory Modal State
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [subCatParentId, setSubCatParentId] = useState('');
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subOrder, setSubOrder] = useState('0');
  const [subActive, setSubActive] = useState(true);
  const [savingSubcategory, setSavingSubcategory] = useState(false);

  const slugify = (text) => {
    return (text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, subs] = await Promise.all([
        getCategories(true),
        getSubcategories(null, null, true),
      ]);
      setCategories(cats || []);
      setSubcategories(subs || []);
    } catch (err) {
      console.warn('Error loading catalog data in Admin:', err);
      showAlert('Error', 'Failed to load catalog data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Category Modal for Create/Edit
  const openCategoryModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name || '');
      setCatCode(cat.code || '');
      setCatIcon(cat.icon || 'cube');
      setCatDesc(cat.description || '');
      setCatOrder(cat.display_order ? String(cat.display_order) : '0');
      setCatActive(cat.is_active !== undefined ? cat.is_active : true);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatCode('');
      setCatIcon('cube');
      setCatDesc('');
      setCatOrder(String((categories.length || 0) + 1));
      setCatActive(true);
    }
    setCategoryModalVisible(true);
  };

  // Open Subcategory Modal for Create/Edit
  const openSubcategoryModal = (sub = null, defaultParentId = null) => {
    if (sub) {
      setEditingSubcategory(sub);
      setSubCatParentId(sub.category_id || defaultParentId || (categories[0]?.id || ''));
      setSubName(sub.name || '');
      setSubCode(sub.code || '');
      setSubDesc(sub.description || '');
      setSubOrder(sub.display_order ? String(sub.display_order) : '0');
      setSubActive(sub.is_active !== undefined ? sub.is_active : true);
    } else {
      setEditingSubcategory(null);
      const parentId = defaultParentId || (selectedParentCategoryId !== 'all' ? selectedParentCategoryId : (categories[0]?.id || ''));
      setSubCatParentId(parentId);
      setSubName('');
      setSubCode('');
      setSubDesc('');
      setSubOrder('1');
      setSubActive(true);
    }
    setSubcategoryModalVisible(true);
  };

  // Save Category
  const handleSaveCategory = async () => {
    if (!catName.trim()) {
      showAlert('Required', 'Please enter a category name.');
      return;
    }
    const finalCode = (catCode.trim() || slugify(catName)).toLowerCase();
    if (!finalCode) {
      showAlert('Required', 'Please enter a valid unique category code.');
      return;
    }

    setSavingCategory(true);
    try {
      const payload = {
        name: catName.trim(),
        code: finalCode,
        icon: catIcon.trim() || 'cube',
        description: catDesc.trim(),
        display_order: parseInt(catOrder, 10) || 0,
        is_active: catActive,
      };

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
        showAlert('Success', `Category "${payload.name}" updated successfully.`);
      } else {
        await createCategory(payload);
        showAlert('Success', `Category "${payload.name}" created successfully.`);
      }
      setCategoryModalVisible(false);
      loadData();
    } catch (err) {
      console.error('Save category error:', err);
      showAlert('Error', `Failed to save category: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingCategory(false);
    }
  };

  // Save Subcategory
  const handleSaveSubcategory = async () => {
    if (!subName.trim()) {
      showAlert('Required', 'Please enter a subcategory name.');
      return;
    }
    if (!subCatParentId) {
      showAlert('Required', 'Please select a parent category.');
      return;
    }
    const finalCode = (subCode.trim() || slugify(subName)).toLowerCase();

    setSavingSubcategory(true);
    try {
      const payload = {
        category_id: subCatParentId,
        name: subName.trim(),
        code: finalCode,
        description: subDesc.trim(),
        display_order: parseInt(subOrder, 10) || 0,
        is_active: subActive,
      };

      if (editingSubcategory) {
        await updateSubcategory(editingSubcategory.id, payload);
        showAlert('Success', `Subcategory "${payload.name}" updated successfully.`);
      } else {
        await createSubcategory(payload);
        showAlert('Success', `Subcategory "${payload.name}" created successfully.`);
      }
      setSubcategoryModalVisible(false);
      loadData();
    } catch (err) {
      console.error('Save subcategory error:', err);
      showAlert('Error', `Failed to save subcategory: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingSubcategory(false);
    }
  };

  // Toggle Category Active Status
  const handleToggleCategoryActive = async (cat, newVal) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, is_active: newVal } : c))
    );
    try {
      await updateCategory(cat.id, { is_active: newVal });
    } catch (err) {
      console.error('Toggle category active error:', err);
      showAlert('Error', 'Failed to update status.');
      loadData();
    }
  };

  // Toggle Subcategory Active Status
  const handleToggleSubcategoryActive = async (sub, newVal) => {
    setSubcategories((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, is_active: newVal } : s))
    );
    try {
      await updateSubcategory(sub.id, { is_active: newVal });
    } catch (err) {
      console.error('Toggle subcategory active error:', err);
      showAlert('Error', 'Failed to update status.');
      loadData();
    }
  };

  // Delete Category
  const handleDeleteCategory = (cat) => {
    showConfirm(
      'Delete Category',
      `Are you sure you want to delete category "${cat.name}"? All related subcategories may also be deleted.`,
      async () => {
        try {
          await deleteCategory(cat.id);
          showAlert('Deleted', `Category "${cat.name}" has been removed.`);
          loadData();
        } catch (err) {
          console.error('Delete category error:', err);
          showAlert('Error', `Failed to delete category: ${err.message}`);
        }
      },
      () => {},
      'Delete',
      'Cancel'
    );
  };

  // Delete Subcategory
  const handleDeleteSubcategory = (sub) => {
    showConfirm(
      'Delete Subcategory',
      `Are you sure you want to delete subcategory "${sub.name}"?`,
      async () => {
        try {
          await deleteSubcategory(sub.id);
          showAlert('Deleted', `Subcategory "${sub.name}" has been removed.`);
          loadData();
        } catch (err) {
          console.error('Delete subcategory error:', err);
          showAlert('Error', `Failed to delete subcategory: ${err.message}`);
        }
      },
      () => {},
      'Delete',
      'Cancel'
    );
  };

  // Reset / Seed Master Data
  const handleSeedMasterData = () => {
    showConfirm(
      'Seed Master Data',
      'This will populate default standard categories and subcategories (Grocery, Fruits & Veg, Dairy, etc.) into the database. Proceed?',
      async () => {
        setLoading(true);
        const res = await seedMasterCatalogData();
        setLoading(false);
        if (res.success) {
          showAlert('Success', 'Master catalog data has been loaded successfully!');
          loadData();
        } else {
          showAlert('Notice', `Master data seed completed: ${res.error || 'Done'}`);
          loadData();
        }
      },
      () => {},
      'Proceed',
      'Cancel'
    );
  };

  // Subcategory counts per category
  const subcategoryCounts = useMemo(() => {
    const counts = {};
    subcategories.forEach((s) => {
      const pId = s.category_id;
      if (pId) {
        counts[pId] = (counts[pId] || 0) + 1;
      }
    });
    return counts;
  }, [subcategories]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    let list = categories;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [categories, searchQuery]);

  // Filtered subcategories
  const filteredSubcategories = useMemo(() => {
    let list = subcategories;
    if (selectedParentCategoryId && selectedParentCategoryId !== 'all') {
      list = list.filter((s) => s.category_id === selectedParentCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.code || '').toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [subcategories, selectedParentCategoryId, searchQuery]);

  // Helper to get parent category for a subcategory
  const getParentCategory = (categoryId) => {
    return categories.find((c) => c.id === categoryId || c.code === categoryId);
  };

  return (
    <View style={styles.rootContainer}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Catalog');
              }
            }}
            accessibilityLabel="Back"
          >
            <Icon name="arrow-left" size={18} color="#007AFF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Catalog Manager</Text>
            <Text style={styles.headerSubtitle}>Admin Category & Subcategory Master</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.seedButton}
          onPress={handleSeedMasterData}
          accessibilityLabel="Load Master Data"
        >
          <Icon name="database" size={13} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.seedButtonText}>Seed Master</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'categories' && styles.tabButtonActive]}
          onPress={() => {
            setActiveTab('categories');
            setSearchQuery('');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="th-large"
            size={14}
            color={activeTab === 'categories' ? '#007AFF' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabButtonText, activeTab === 'categories' && styles.tabButtonTextActive]}>
            Categories ({categories.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'subcategories' && styles.tabButtonActive]}
          onPress={() => {
            setActiveTab('subcategories');
            setSearchQuery('');
          }}
          activeOpacity={0.8}
        >
          <Icon
            name="tags"
            size={14}
            color={activeTab === 'subcategories' ? '#007AFF' : '#64748B'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.tabButtonText, activeTab === 'subcategories' && styles.tabButtonTextActive]}>
            Subcategories ({subcategories.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Bar (Search + Add) */}
      <View style={styles.actionBar}>
        <View style={styles.searchBox}>
          <Icon name="search" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'categories'
                ? 'Search categories by name or code...'
                : 'Search subcategories...'
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="times-circle" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (activeTab === 'categories') {
              openCategoryModal();
            } else {
              openSubcategoryModal();
            }
          }}
          activeOpacity={0.8}
        >
          <Icon name="plus" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.addButtonText}>
            {activeTab === 'categories' ? 'Add Category' : 'Add Subcategory'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Subcategory Parent Category Filter Bar */}
      {activeTab === 'subcategories' && (
        <View style={styles.parentFilterBar}>
          <Text style={styles.parentFilterLabel}>Filter by Parent:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[
                styles.parentChip,
                selectedParentCategoryId === 'all' && styles.parentChipActive,
              ]}
              onPress={() => setSelectedParentCategoryId('all')}
            >
              <Text
                style={[
                  styles.parentChipText,
                  selectedParentCategoryId === 'all' && styles.parentChipTextActive,
                ]}
              >
                All Categories ({subcategories.length})
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const isSel = selectedParentCategoryId === cat.id;
              const count = subcategoryCounts[cat.id] || 0;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.parentChip, isSel && styles.parentChipActive]}
                  onPress={() => setSelectedParentCategoryId(isSel ? 'all' : cat.id)}
                >
                  <Icon
                    name={cat.icon || 'tag'}
                    size={11}
                    color={isSel ? '#FFFFFF' : '#475569'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.parentChipText, isSel && styles.parentChipTextActive]}>
                    {cat.name} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading catalog details...</Text>
        </View>
      ) : activeTab === 'categories' ? (
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => item.id.toString()}
          style={styles.flatList}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={true}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="th-large" size={42} color="#CBD5E1" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Categories Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim()
                  ? `No categories match "${searchQuery}".`
                  : 'Click "+ Add Category" or "Seed Master" to populate categories.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const subCount = subcategoryCounts[item.id] || 0;
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconBox}>
                    <Icon name={item.icon || 'cube'} size={18} color="#007AFF" />
                  </View>
                  <View style={styles.cardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{item.code}</Text>
                      </View>
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderBadgeText}>#{item.display_order}</Text>
                      </View>
                    </View>
                    {item.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardSwitchBox}>
                    <Text style={[styles.activeStatusText, { color: item.is_active ? '#10B981' : '#94A3B8' }]}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Text>
                    <Switch
                      value={item.is_active}
                      onValueChange={(val) => handleToggleCategoryActive(item, val)}
                      trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                      thumbColor={item.is_active ? '#10B981' : '#CBD5E1'}
                      style={{ transform: Platform.OS === 'ios' ? [{ scaleX: 0.8 }, { scaleY: 0.8 }] : [] }}
                    />
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.footerSubBtn}
                    onPress={() => {
                      setSelectedParentCategoryId(item.id);
                      setActiveTab('subcategories');
                    }}
                  >
                    <Icon name="tags" size={12} color="#007AFF" style={{ marginRight: 6 }} />
                    <Text style={styles.footerSubBtnText}>
                      {subCount} {subCount === 1 ? 'Subcategory' : 'Subcategories'}
                    </Text>
                    <Icon name="chevron-right" size={10} color="#007AFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>

                  <View style={styles.footerActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openSubcategoryModal(null, item.id)}
                      accessibilityLabel="Add Subcategory under this Category"
                    >
                      <Icon name="plus" size={12} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={[styles.cardActionText, { color: '#10B981' }]}>+ Sub</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openCategoryModal(item)}
                      accessibilityLabel="Edit Category"
                    >
                      <Icon name="pencil" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.cardActionText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardDeleteBtn]}
                      onPress={() => handleDeleteCategory(item)}
                      accessibilityLabel="Delete Category"
                    >
                      <Icon name="trash" size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredSubcategories}
          keyExtractor={(item) => item.id.toString()}
          style={styles.flatList}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={true}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="tags" size={42} color="#CBD5E1" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Subcategories Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim()
                  ? `No subcategories match "${searchQuery}".`
                  : 'Click "+ Add Subcategory" to add items to this category.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const parentCat = getParentCategory(item.category_id);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Icon name="bookmark" size={16} color="#10B981" />
                  </View>
                  <View style={styles.cardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{item.code}</Text>
                      </View>
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderBadgeText}>#{item.display_order}</Text>
                      </View>
                    </View>

                    {parentCat ? (
                      <View style={styles.parentBadge}>
                        <Icon
                          name={parentCat.icon || 'folder'}
                          size={10}
                          color="#007AFF"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.parentBadgeText}>
                          Category: {parentCat.name}
                        </Text>
                      </View>
                    ) : null}

                    {item.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.cardSwitchBox}>
                    <Text style={[styles.activeStatusText, { color: item.is_active ? '#10B981' : '#94A3B8' }]}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </Text>
                    <Switch
                      value={item.is_active}
                      onValueChange={(val) => handleToggleSubcategoryActive(item, val)}
                      trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                      thumbColor={item.is_active ? '#10B981' : '#CBD5E1'}
                      style={{ transform: Platform.OS === 'ios' ? [{ scaleX: 0.8 }, { scaleY: 0.8 }] : [] }}
                    />
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <View />
                  <View style={styles.footerActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openSubcategoryModal(item)}
                      accessibilityLabel="Edit Subcategory"
                    >
                      <Icon name="pencil" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.cardActionText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardDeleteBtn]}
                      onPress={() => handleDeleteSubcategory(item)}
                      accessibilityLabel="Delete Subcategory"
                    >
                      <Icon name="trash" size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: Add / Edit Category */}
      {/* ========================================================================= */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={categoryModalVisible}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <Icon name="times-circle" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <Text style={styles.inputLabel}>Category Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Dairy & Bakery"
                value={catName}
                onChangeText={(t) => {
                  setCatName(t);
                  if (!editingCategory && !catCode) {
                    setCatCode(slugify(t));
                  }
                }}
              />

              <Text style={styles.inputLabel}>Code / Slug (Unique identifier) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. dairy_bakery"
                value={catCode}
                onChangeText={(t) => setCatCode(slugify(t))}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Icon (FontAwesome)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. birthday-cake"
                value={catIcon}
                onChangeText={setCatIcon}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { marginTop: 4 }]}>Quick Select Icon:</Text>
              <View style={styles.presetIconsGrid}>
                {POPULAR_ICONS.map((ic) => (
                  <TouchableOpacity
                    key={ic}
                    style={[styles.presetIconBtn, catIcon === ic && styles.presetIconBtnActive]}
                    onPress={() => setCatIcon(ic)}
                  >
                    <Icon name={ic} size={15} color={catIcon === ic ? '#FFFFFF' : '#475569'} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Display Order</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0"
                keyboardType="numeric"
                value={catOrder}
                onChangeText={setCatOrder}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, styles.multilineInput]}
                placeholder="Optional description of items in this category"
                value={catDesc}
                onChangeText={setCatDesc}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalSwitchRow}>
                <Text style={styles.modalSwitchLabel}>Active (Visible to users & sellers)</Text>
                <Switch
                  value={catActive}
                  onValueChange={setCatActive}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                  thumbColor={catActive ? '#10B981' : '#CBD5E1'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCategoryModalVisible(false)}
                disabled={savingCategory}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveCategory}
                disabled={savingCategory}
              >
                {savingCategory ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save Category</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: Add / Edit Subcategory */}
      {/* ========================================================================= */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={subcategoryModalVisible}
        onRequestClose={() => setSubcategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {editingSubcategory ? 'Edit Subcategory' : 'Add New Subcategory'}
              </Text>
              <TouchableOpacity onPress={() => setSubcategoryModalVisible(false)}>
                <Icon name="times-circle" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <Text style={styles.inputLabel}>Parent Category *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {categories.map((c) => {
                    const isParentSelected = subCatParentId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.parentChip,
                          isParentSelected && styles.parentChipActive,
                        ]}
                        onPress={() => setSubCatParentId(c.id)}
                      >
                        <Icon
                          name={c.icon || 'folder'}
                          size={11}
                          color={isParentSelected ? '#FFFFFF' : '#475569'}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.parentChipText,
                            isParentSelected && styles.parentChipTextActive,
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.inputLabel}>Subcategory Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Atta, Flours & Grains"
                value={subName}
                onChangeText={(t) => {
                  setSubName(t);
                  if (!editingSubcategory && !subCode) {
                    setSubCode(slugify(t));
                  }
                }}
              />

              <Text style={styles.inputLabel}>Code / Slug (Unique per category) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. atta_flours"
                value={subCode}
                onChangeText={(t) => setSubCode(slugify(t))}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Display Order</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0"
                keyboardType="numeric"
                value={subOrder}
                onChangeText={setSubOrder}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, styles.multilineInput]}
                placeholder="Optional description for this subcategory"
                value={subDesc}
                onChangeText={setSubDesc}
                multiline
                numberOfLines={3}
              />

              <View style={styles.modalSwitchRow}>
                <Text style={styles.modalSwitchLabel}>Active (Visible to users & sellers)</Text>
                <Switch
                  value={subActive}
                  onValueChange={setSubActive}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                  thumbColor={subActive ? '#10B981' : '#CBD5E1'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSubcategoryModalVisible(false)}
                disabled={savingSubcategory}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveSubcategory}
                disabled={savingSubcategory}
              >
                {savingSubcategory ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save Subcategory</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Persistent Bottom Navigation Footer */}
      <StoreNavigationFooter
        activeTab={activeFooterTab}
        navigation={navigation}
        route={route}
        sellerId={routeSellerId}
        sellerName={routeSellerName}
        customerId={routeCustomerId}
        forceShow={true}
        onStorePress={() => {
          navigation.navigate('Catalog', {
            sellerId: routeSellerId,
            sellerName: routeSellerName,
            customerId: routeCustomerId,
          });
        }}
        onProfilePress={() => {
          navigation.navigate('Profile', {
            sellerId: routeSellerId,
            sellerName: routeSellerName,
            customerId: routeCustomerId,
          });
        }}
        onStoresPress={() => {
          navigation.navigate('SellersMap');
        }}
        onCartPress={() => {
          navigation.navigate('Cart', {
            sellerId: routeSellerId,
            sellerName: routeSellerName,
            customerId: routeCustomerId,
          });
        }}
        onOrdersPress={() => {
          navigation.navigate('OrderList', {
            sellerId: routeSellerId,
            sellerName: routeSellerName,
            customerId: routeCustomerId,
          });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: Platform.OS === 'web' ? '100%' : undefined,
    maxHeight: Platform.OS === 'web' ? '100vh' : undefined,
    minHeight: 0,
    overflow: 'hidden',
  },
  flatList: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' ? { overflowY: 'auto' } : {}),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexShrink: 0,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  seedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  seedButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
    flexShrink: 0,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabButtonActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
    flexShrink: 0,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  parentFilterBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexShrink: 0,
  },
  parentFilterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  parentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  parentChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  parentChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  parentChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  codeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#475569',
    fontWeight: '600',
  },
  orderBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderBadgeText: {
    fontSize: 10,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  parentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  parentBadgeText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  cardSwitchBox: {
    alignItems: 'center',
    marginLeft: 8,
  },
  activeStatusText: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 10,
  },
  footerSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  footerSubBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
  },
  footerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  cardDeleteBtn: {
    backgroundColor: '#FEF2F2',
  },
  cardActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    padding: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  multilineInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  presetIconsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  presetIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetIconBtnActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  modalSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  modalSwitchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default CatalogManagementScreen;
