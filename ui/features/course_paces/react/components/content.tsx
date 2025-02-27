/*
 * Copyright (C) 2022 - present Instructure, Inc.
 *
 * This file is part of Canvas.
 *
 * Canvas is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, version 3 of the License.
 *
 * Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import React, {useEffect, useRef} from 'react'
import {connect} from 'react-redux'
import {Tabs} from '@instructure/ui-tabs'
import {View} from '@instructure/ui-view'
import {useScope as useI18nScope} from '@canvas/i18n'
import {paceContextsActions} from '../actions/pace_contexts'
import {actions as uiActions} from '../actions/ui'
import {
  APIPaceContextTypes,
  OrderType,
  PaceContext,
  PaceContextTypes,
  ResponsiveSizes,
  SortableColumn,
  StoreState,
} from '../types'
import PaceContextsTable from './pace_contexts_table'
import {getResponsiveSize} from '../reducers/ui'
import Search from './search'

const I18n = useI18nScope('course_paces_app')

const {Panel: TabPanel} = Tabs as any

export const CONTEXT_TYPE_MAP: {[k in APIPaceContextTypes]: PaceContextTypes} = {
  course: 'Course',
  section: 'Section',
  student_enrollment: 'Enrollment',
}

interface PaceContextsContentProps {
  currentPage: number
  currentSearchTerm: string
  currentSortBy: SortableColumn
  currentOrderType: OrderType
  paceContexts: PaceContext[]
  fetchPaceContexts: typeof paceContextsActions.fetchPaceContexts
  selectedContextType: APIPaceContextTypes
  setSelectedContextType: (selectedContextType: APIPaceContextTypes) => void
  setSelectedContext: (selectedPaceContext: PaceContext) => void
  setSelectedModalContext: (contextType: PaceContextTypes, contextId: string) => void
  pageCount: number
  setPage: (page: number) => void
  setSearchTerm: typeof paceContextsActions.setSearchTerm
  setOrderType: typeof paceContextsActions.setOrderType
  isLoading: boolean
  responsiveSize: ResponsiveSizes
}

export const PaceContent = ({
  currentPage,
  currentSearchTerm,
  currentSortBy,
  currentOrderType,
  paceContexts,
  fetchPaceContexts,
  selectedContextType,
  setSelectedModalContext,
  setSelectedContextType,
  setSelectedContext,
  pageCount,
  setPage,
  setSearchTerm,
  setOrderType,
  isLoading,
  responsiveSize,
}: PaceContextsContentProps) => {
  const selectedTab = `tab-${selectedContextType}`
  const currentTypeRef = useRef<string | null>(null)

  useEffect(() => {
    let page = currentPage
    let searchTerm = currentSearchTerm
    let orderType = currentOrderType
    // if switching tabs set page to 1 and reset search term
    if (currentTypeRef.current !== selectedContextType) {
      page = 1
      searchTerm = ''
      orderType = 'asc'
      currentTypeRef.current = selectedContextType
    }
    fetchPaceContexts(selectedContextType, page, searchTerm, currentSortBy, orderType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContextType, currentPage, currentSortBy, currentOrderType])

  const changeTab = (_ev, {id}) => {
    const type = id.split('-')
    setSelectedContextType(type[1])
    setSearchTerm('')
    setOrderType('asc')
  }

  const handleContextSelect = (paceContext: PaceContext) => {
    setSelectedContext(paceContext)
    setSelectedModalContext(CONTEXT_TYPE_MAP[selectedContextType], paceContext.item_id)
  }

  return (
    <Tabs onRequestTabChange={changeTab}>
      <TabPanel
        key="tab-section"
        renderTitle={I18n.t('Sections')}
        id="tab-section"
        isSelected={selectedTab === 'tab-section'}
        padding="none"
      >
        <View
          as="div"
          padding="small"
          background="secondary"
          margin="large none none none"
          borderWidth="small"
        >
          <Search contextType="section" />
        </View>
        <PaceContextsTable
          contextType="section"
          handleContextSelect={handleContextSelect}
          currentPage={currentPage}
          currentOrderType={currentOrderType}
          currentSortBy={currentSortBy}
          paceContexts={paceContexts}
          pageCount={pageCount}
          setPage={setPage}
          setOrderType={setOrderType}
          isLoading={isLoading}
          responsiveSize={responsiveSize}
        />
      </TabPanel>
      <TabPanel
        key="tab-student_enrollment"
        renderTitle={I18n.t('Students')}
        id="tab-student_enrollment"
        isSelected={selectedTab === 'tab-student_enrollment'}
        padding="none"
      >
        <View
          as="div"
          padding="small"
          background="secondary"
          margin="large none none none"
          borderWidth="small"
        >
          <Search contextType="student_enrollment" />
        </View>
        <PaceContextsTable
          contextType="student_enrollment"
          handleContextSelect={handleContextSelect}
          currentPage={currentPage}
          currentOrderType={currentOrderType}
          currentSortBy={currentSortBy}
          paceContexts={paceContexts}
          pageCount={pageCount}
          setPage={setPage}
          setOrderType={setOrderType}
          isLoading={isLoading}
          responsiveSize={responsiveSize}
        />
      </TabPanel>
    </Tabs>
  )
}

const mapStateToProps = (state: StoreState) => ({
  paceContexts: state.paceContexts.entries,
  pageCount: state.paceContexts.pageCount,
  currentPage: state.paceContexts.page,
  currentSearchTerm: state.paceContexts.searchTerm,
  currentSortBy: state.paceContexts.sortBy,
  currentOrderType: state.paceContexts.order,
  isLoading: state.paceContexts.isLoading,
  selectedContextType: state.paceContexts.selectedContextType,
  responsiveSize: getResponsiveSize(state),
})

export default connect(mapStateToProps, {
  setPage: paceContextsActions.setPage,
  setSearchTerm: paceContextsActions.setSearchTerm,
  setOrderType: paceContextsActions.setOrderType,
  fetchPaceContexts: paceContextsActions.fetchPaceContexts,
  setSelectedContextType: paceContextsActions.setSelectedContextType,
  setSelectedContext: paceContextsActions.setSelectedContext,
  setSelectedModalContext: uiActions.setSelectedPaceContext,
})(PaceContent)
